// Eval runner. Feeds each fixture's hand-crafted candidates into the
// narrator (real Sonnet call), then runs trait checks AND a judge prompt
// that scores correctness/surprise/actionability/calibration/non-redundancy.
//
//   ANTHROPIC_API_KEY=... npx tsx evals/insights/run-eval.ts
//
// Exit code is 0 if every fixture passes its trait checks AND the judge
// scores 4+/5 on every axis. Run before merging changes to the narrator
// prompt or candidate computers.

import { narrateInsights } from '@/lib/insights/narrate';
import { anthropic, SONNET } from '@/lib/anthropic';
import { extractJson } from '@/lib/json';
import type { UserDataBundle } from '@/lib/insights/types';
import { FIXTURES, type Fixture } from './fixtures';

const JUDGE_SYSTEM = `You are scoring the output of an insights-narration LLM against a set of synthetic candidate inputs.

You will be given:
- The candidates[] the narrator saw (each with deterministic metrics).
- The narrated insights[] the model produced.

Score 1-5 on each axis. 1 = bad, 5 = excellent.

Axes:
1. CORRECTNESS: Every number in every headline/why_it_matters/caveat traces back to candidates[].metrics. No fabricated stats. (5 = no fabrication; 1 = clear fabrication.)
2. SURPRISE: The insights are non-obvious. Don't reward stating-the-obvious (e.g. "more carbs -> more calories"). (5 = a knowledgeable user would learn something.)
3. ACTIONABILITY: Insights suggest or imply action. Pure observations score lower. (5 = clear implication; 3 = mostly observational; 1 = vague.)
4. CALIBRATION: Caveats are present where required (low n, overlapping interventions, etc.). (5 = honest caveats; 1 = false confidence.)
5. NON_REDUNDANCY: No two insights say the same thing. (5 = all distinct; 1 = duplicates.)

Return JSON only:
{
  "correctness": 1-5,
  "surprise": 1-5,
  "actionability": 1-5,
  "calibration": 1-5,
  "non_redundancy": 1-5,
  "notes": "one short paragraph explaining anything below 4"
}`;

async function judge(fixture: Fixture, narrated: unknown): Promise<{
  correctness: number;
  surprise: number;
  actionability: number;
  calibration: number;
  non_redundancy: number;
  notes: string;
}> {
  const userPrompt = `Candidates the narrator saw:\n${JSON.stringify(
    fixture.candidates.map((c, i) => ({ index: i, kind: c.kind, metrics: c.metrics })),
    null,
    2,
  )}\n\nNarrated insights:\n${JSON.stringify(narrated, null, 2)}\n\nScore now.`;

  const response = await anthropic().messages.create({
    model: SONNET,
    max_tokens: 600,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = response.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  return extractJson(text);
}

function checkTraits(
  fixture: Fixture,
  insights: { headline: string; why_it_matters?: string; caveats?: string[] }[],
): string[] {
  const failures: string[] = [];
  const allText = insights
    .map((i) => `${i.headline}\n${i.why_it_matters ?? ''}\n${(i.caveats ?? []).join('\n')}`)
    .join('\n')
    .toLowerCase();

  for (const phrase of fixture.expected.must_mention ?? []) {
    if (!allText.includes(phrase.toLowerCase())) {
      failures.push(`missing required mention: "${phrase}"`);
    }
  }
  for (const phrase of fixture.expected.must_not_mention ?? []) {
    if (allText.includes(phrase.toLowerCase())) {
      failures.push(`contains forbidden phrase: "${phrase}"`);
    }
  }
  if (fixture.expected.min_insights != null && insights.length < fixture.expected.min_insights) {
    failures.push(
      `got ${insights.length} insights, expected at least ${fixture.expected.min_insights}`,
    );
  }
  if (fixture.expected.max_insights != null && insights.length > fixture.expected.max_insights) {
    failures.push(
      `got ${insights.length} insights, expected at most ${fixture.expected.max_insights}`,
    );
  }
  if (fixture.expected.require_overlap_caveat) {
    const hit = insights.some((i) =>
      (i.caveats ?? []).some((c) => /other|overlap|same window|started.*also|magnesium/i.test(c)),
    );
    if (!hit) failures.push('expected an overlap/confound caveat, none found');
  }
  return failures;
}

async function main() {
  let pass = 0;
  let fail = 0;
  for (const fx of FIXTURES) {
    process.stdout.write(`• ${fx.name} … `);
    const bundle: UserDataBundle = {
      user_id: 'eval',
      window: fx.partial_bundle.window,
      long_window: fx.partial_bundle.long_window,
      recent_entries: [],
      recent_food_items: [],
      recent_workouts: [],
      recent_supplements: [],
      daily_aggregates: [],
      interventions: fx.partial_bundle.interventions,
      profile_md: fx.partial_bundle.profile_md,
      medical_docs_text: null,
      recent_feedback: fx.partial_bundle.recent_feedback,
    };
    const { insights, usage } = await narrateInsights(fx.candidates, bundle);
    const traitFailures = checkTraits(fx, insights);
    const scores = await judge(fx, insights);

    const axesAllPass = ['correctness', 'surprise', 'actionability', 'calibration', 'non_redundancy']
      .map((k) => scores[k as keyof typeof scores] as number)
      .every((s) => s >= 4);

    const ok = traitFailures.length === 0 && axesAllPass;
    if (ok) {
      pass++;
      process.stdout.write(`PASS  (cost $${usage.costUsd.toFixed(4)})\n`);
    } else {
      fail++;
      process.stdout.write(`FAIL  (cost $${usage.costUsd.toFixed(4)})\n`);
      if (traitFailures.length) {
        for (const t of traitFailures) process.stdout.write(`    trait: ${t}\n`);
      }
      process.stdout.write(`    scores: ${JSON.stringify(scores)}\n`);
      process.stdout.write(`    insights: ${JSON.stringify(insights, null, 2)}\n`);
    }
  }
  process.stdout.write(`\n${pass} pass / ${fail} fail / ${pass + fail} total\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
