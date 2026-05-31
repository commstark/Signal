// Orchestrator that runs the full weekly pipeline for one user:
//   aggregate -> compute candidates -> narrate -> persist -> push.
//
// Used by both the Vercel cron route (loops over all users) and the
// admin "Run my reflection now" trigger (single user).

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { recordUsage } from '@/lib/usage';
import { aggregateUserData } from './aggregate';
import { computeCandidates } from './candidates';
import { narrateInsights } from './narrate';
import { sendInsightPush } from '@/lib/push';
import type { Candidate, NarratedInsight } from './types';

const MAX_INSIGHTS = 5;

export interface RunResult {
  user_id: string;
  candidates_found: number;
  insights_written: number;
  cost_usd: number;
  duration_ms: number;
  error?: string;
}

export async function runWeeklyForUser(userId: string, now = new Date()): Promise<RunResult> {
  const started = Date.now();
  try {
    const bundle = await aggregateUserData(userId, now);
    if (bundle.daily_aggregates.length < 5) {
      return {
        user_id: userId,
        candidates_found: 0,
        insights_written: 0,
        cost_usd: 0,
        duration_ms: Date.now() - started,
        error: `Not enough history yet — found ${bundle.daily_aggregates.length} day(s) of structured data. Need at least 5 days to surface a pattern.`,
      };
    }

    const candidates = computeCandidates(bundle);
    const { insights, usage } = await narrateInsights(candidates, bundle);

    await recordUsage({
      userId,
      service: 'anthropic',
      model: usage.model,
      endpoint: 'insights-weekly',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    });

    const written = await persistInsights(userId, bundle.window, candidates, insights);

    if (written > 0) {
      await sendInsightPush(userId, written).catch((e) => {
        console.error('push fan-out failed', e);
      });
    }

    return {
      user_id: userId,
      candidates_found: candidates.length,
      insights_written: written,
      cost_usd: usage.costUsd,
      duration_ms: Date.now() - started,
    };
  } catch (err) {
    return {
      user_id: userId,
      candidates_found: 0,
      insights_written: 0,
      cost_usd: 0,
      duration_ms: Date.now() - started,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

async function persistInsights(
  userId: string,
  window: { start: string; end: string },
  candidates: Candidate[],
  insights: NarratedInsight[],
): Promise<number> {
  const sb = createSupabaseAdmin();

  // Supersede the previous week's active insights so the dashboard shows
  // only the latest set.
  await sb
    .from('weekly_insights')
    .update({ status: 'superseded' })
    .eq('user_id', userId)
    .eq('status', 'active');

  const rows = insights
    .slice(0, MAX_INSIGHTS)
    .map((ins) => {
      const cand = candidates[ins.candidate_index];
      if (!cand) return null;
      return {
        user_id: userId,
        window_start: window.start,
        window_end: window.end,
        kind: cand.kind,
        domains: cand.domains,
        headline: ins.headline.slice(0, 200),
        why_it_matters: ins.why_it_matters?.slice(0, 300) ?? null,
        caveats: Array.isArray(ins.caveats) ? ins.caveats.slice(0, 5) : [],
        surprise_score: Number.isFinite(ins.surprise_score) ? ins.surprise_score : null,
        metrics: cand.metrics,
        evidence: cand.evidence,
        status: 'active',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return 0;

  const { error } = await sb.from('weekly_insights').insert(rows);
  if (error) throw new Error(`weekly_insights insert: ${error.message}`);
  return rows.length;
}

// Loop helper for the cron path. Loops users with at least one entry in
// the last 14 days (skips truly inactive users).
export async function runWeeklyForAllUsers(now = new Date()): Promise<RunResult[]> {
  const sb = createSupabaseAdmin();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 14);

  const { data } = await sb
    .from('entries')
    .select('user_id')
    .gte('occurred_at', since.toISOString());

  const userIds = Array.from(new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)));

  const results: RunResult[] = [];
  for (const uid of userIds) {
    results.push(await runWeeklyForUser(uid, now));
  }
  return results;
}
