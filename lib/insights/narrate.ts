import { anthropic, SONNET, estimateCostUsd } from '@/lib/anthropic';
import { extractJson } from '@/lib/json';
import type { Candidate, NarratedInsight, UserDataBundle } from './types';

export interface NarrateResult {
  insights: NarratedInsight[];
  usage: { model: string; inputTokens: number; outputTokens: number; costUsd: number };
}

const SYSTEM_PROMPT = `You are reviewing one user's last 1-12 weeks of self-tracking data to surface the 3-5 most surprising, action-relevant insights.

CONTRACT
- You are NEVER permitted to invent statistics. Every number in a headline or caveat MUST come from the candidates[] array you are given. If a stat isn't in the metrics object, you cannot use it.
- Rank candidates by SURPRISE, not by effect size alone. A small effect on an obvious thing ("more carbs -> more calories") is worse than a moderate effect on a non-obvious thing ("legs day -> next-day mood +1.4").
- "Surprise" = the insight tells the user something they couldn't have noticed by glancing at the daily tiles.
- Action-flavored beats observational. Bad: "Your protein varies." Good: "Days with protein < 80g show next-day energy drop 1.4 points (n=12). Floor it."

OUTPUT
Return JSON only. Schema:
{
  "insights": [
    {
      "candidate_index": number,  // 0-indexed into candidates[]
      "headline": string,          // <= 140 chars; concrete + action-flavored when possible
      "why_it_matters": string,    // <= 200 chars; one-sentence implication
      "caveats": string[],         // confounds the user should know about (other interventions in same window, low n, seasonality, etc). Be honest.
      "surprise_score": number     // 0..1, your rank
    }
  ]
}

RULES
1. Pick 3-5 insights total. Skip the rest. Quality > quantity.
2. Never pick two insights that say the same thing in different words.
3. Skip anything obvious. If the user said "I exercise more on Mondays" - we already know.
4. For intervention_window kind, ALWAYS list the start_date in the headline ("4 weeks after creatine, bench top set 215 -> 235").
5. For correlation kind, name the lag explicitly ("next-day energy", "same-day mood").
6. Caveats are required if: n < 20, OR other interventions started within ±14 days of the candidate window, OR the user has previously downvoted this exact pattern.
7. If the user has marked similar insights "wrong" in feedback, skip the candidate or include a "you flagged a similar one as wrong before — re-check the math" caveat.
8. If the candidates[] list is empty or has nothing strong, return { "insights": [] }. Don't manufacture insights.`;

interface FeedbackHint {
  headline: string;
  verdict: 'up' | 'down' | 'wrong';
  note: string | null;
}

function buildUserPrompt(candidates: Candidate[], bundle: UserDataBundle): string {
  const interestProfile = extractInterestProfile(bundle.profile_md);
  const feedbackSection = formatFeedback(bundle.recent_feedback);
  const candidatesJson = JSON.stringify(
    candidates.map((c, i) => ({
      index: i,
      kind: c.kind,
      domains: c.domains,
      metrics: c.metrics,
      // Don't ship full evidence to Sonnet — too many tokens. Just the
      // summary stats. Evidence stays in the DB for the dashboard.
      strength_hint: c.strength,
    })),
    null,
    2,
  );

  return [
    `WINDOW: ${bundle.window.start} to ${bundle.window.end} (recent 7d), long window back to ${bundle.long_window.start}.`,
    '',
    `# Interest profile (from user)`,
    interestProfile || '(none provided)',
    '',
    `# Active interventions`,
    bundle.interventions.length === 0
      ? '(none)'
      : bundle.interventions
          .map(
            (iv) =>
              `- ${iv.name} (${iv.type}, ${iv.direction}) — started ${iv.start_date.slice(0, 10)}${iv.end_date ? `, ended ${iv.end_date.slice(0, 10)}` : ''}`,
          )
          .join('\n'),
    '',
    `# Recent feedback (informs ranking)`,
    feedbackSection,
    '',
    `# Candidate signals (deterministic, already passed thresholds)`,
    'These are real survivors of effect-size + n thresholds. Pick the 3-5 most SURPRISING ones.',
    '',
    candidatesJson,
    '',
    'Return JSON only, matching the schema in the system prompt.',
  ].join('\n');
}

function formatFeedback(items: FeedbackHint[]): string {
  if (items.length === 0) return '(no feedback yet)';
  const up = items.filter((i) => i.verdict === 'up');
  const down = items.filter((i) => i.verdict === 'down');
  const wrong = items.filter((i) => i.verdict === 'wrong');
  const parts: string[] = [];
  if (up.length)
    parts.push(`Upvoted (give similar patterns weight):\n${up.map((i) => `  - ${i.headline}`).join('\n')}`);
  if (down.length)
    parts.push(
      `Downvoted (deprioritize similar patterns):\n${down.map((i) => `  - ${i.headline}`).join('\n')}`,
    );
  if (wrong.length)
    parts.push(
      `Flagged as WRONG (highest signal — be extra careful with similar patterns, or skip):\n${wrong
        .map((i) => `  - ${i.headline}${i.note ? ` (${i.note})` : ''}`)
        .join('\n')}`,
    );
  return parts.join('\n\n');
}

// Pulls a "# Interests" section out of profile_md if present, otherwise
// returns the whole profile. The profile can carry lots else (medical,
// goals); we just want what tells Sonnet what kind of insights to favor.
function extractInterestProfile(profileMd: string | null): string {
  if (!profileMd) return '';
  const m = profileMd.match(/##?\s*Interests?[\s\S]*?(?=\n##?\s|\n*$)/i);
  return m ? m[0].trim() : profileMd.slice(0, 2000);
}

export async function narrateInsights(
  candidates: Candidate[],
  bundle: UserDataBundle,
): Promise<NarrateResult> {
  if (candidates.length === 0) {
    return {
      insights: [],
      usage: { model: SONNET, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }

  const userPrompt = buildUserPrompt(candidates, bundle);

  const response = await anthropic().messages.create({
    model: SONNET,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  const parsed = extractJson<{ insights: NarratedInsight[] }>(text);
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    insights: (parsed.insights ?? []).filter(
      (i) =>
        typeof i.candidate_index === 'number' &&
        i.candidate_index >= 0 &&
        i.candidate_index < candidates.length &&
        typeof i.headline === 'string' &&
        i.headline.trim().length > 0,
    ),
    usage: {
      model: SONNET,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(SONNET, inputTokens, outputTokens),
    },
  };
}
