// Tool implementations the /signals Q&A endpoint exposes to Sonnet.
// Each is a focused query that returns JSON small enough to fit in
// context without ballooning costs. The model can chain them — pull an
// aggregate, then a correlation, then emit a chart — to ground every
// number it says in actual data.

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { loadSignalsBundle } from '@/lib/signals/aggregate';
import type { Metric, ChartSpec, RenderedChartData } from './spec';

// ---------- query_metric ----------

export interface QueryMetricArgs {
  metric: Metric;
  window_days: number;
  // 0 = same day; positive integer lags the values forward by N days,
  // so { metric: energy_score, lag_days: 1 } returns "next-day energy"
  // keyed by the same dates as the predictor.
  lag_days?: number;
}

export interface QueryMetricResult {
  metric: Metric;
  window_days: number;
  lag_days: number;
  n: number;
  series: Array<{ date: string; value: number }>;
  summary: { mean: number | null; sd: number | null; min: number | null; max: number | null };
}

export async function tool_query_metric(userId: string, args: QueryMetricArgs): Promise<QueryMetricResult> {
  const lag = Math.max(0, Math.floor(args.lag_days ?? 0));
  const bundle = await loadSignalsBundle(userId, normalizeWindow(args.window_days));

  const series: Array<{ date: string; value: number }> = [];
  for (const d of bundle.macros) {
    const v = pullMetric(args.metric, bundle, d.date);
    if (v != null) series.push({ date: d.date, value: round(v, 2) });
  }
  // Shift dates back by lag so the series can be paired against same-date
  // predictors elsewhere in the chain.
  const shifted = lag > 0 ? series.map((p) => ({ date: shiftDate(p.date, -lag), value: p.value })) : series;
  const values = shifted.map((p) => p.value);

  return {
    metric: args.metric,
    window_days: bundle.range.days,
    lag_days: lag,
    n: shifted.length,
    series: shifted,
    summary: {
      mean: values.length ? round(mean(values), 2) : null,
      sd: values.length >= 2 ? round(sd(values), 2) : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    },
  };
}

// ---------- compute_correlation ----------

export interface CorrelationArgs {
  metric_a: Metric;
  metric_b: Metric;
  window_days: number;
  lag_days?: number; // applied to metric_b, so 1 = "does a predict next-day b?"
}

export interface CorrelationResult {
  metric_a: Metric;
  metric_b: Metric;
  lag_days: number;
  window_days: number;
  n: number;
  pearson_r: number;
  // Plain-English direction so the model doesn't have to think about
  // the sign convention. Only set when |r| >= 0.2.
  direction: 'positive' | 'negative' | 'weak';
  paired_points: Array<{ date: string; a: number; b: number }>;
}

export async function tool_compute_correlation(
  userId: string,
  args: CorrelationArgs,
): Promise<CorrelationResult> {
  const lag = Math.max(0, Math.floor(args.lag_days ?? 0));
  const bundle = await loadSignalsBundle(userId, normalizeWindow(args.window_days));

  const aByDate = new Map<string, number>();
  const bByDate = new Map<string, number>();
  for (const d of bundle.macros) {
    const a = pullMetric(args.metric_a, bundle, d.date);
    const b = pullMetric(args.metric_b, bundle, d.date);
    if (a != null) aByDate.set(d.date, a);
    if (b != null) bByDate.set(d.date, b);
  }
  const paired: Array<{ date: string; a: number; b: number }> = [];
  for (const [date, a] of aByDate) {
    const bDate = lag > 0 ? shiftDate(date, lag) : date;
    const b = bByDate.get(bDate);
    if (b == null) continue;
    paired.push({ date, a, b });
  }
  const r = paired.length >= 3 ? pearson(paired.map((p) => p.a), paired.map((p) => p.b)) : 0;
  const direction: CorrelationResult['direction'] =
    Math.abs(r) < 0.2 ? 'weak' : r > 0 ? 'positive' : 'negative';
  return {
    metric_a: args.metric_a,
    metric_b: args.metric_b,
    lag_days: lag,
    window_days: bundle.range.days,
    n: paired.length,
    pearson_r: round(r, 3),
    direction,
    paired_points: paired,
  };
}

// ---------- list_recent_logs ----------

export interface ListRecentLogsArgs {
  window_days: number;
  intent?: 'health_log' | 'workout_log' | 'supplement_log' | 'mixed';
  limit?: number;
}

export async function tool_list_recent_logs(userId: string, args: ListRecentLogsArgs) {
  const sb = createSupabaseAdmin();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - normalizeWindow(args.window_days));
  let q = sb
    .from('entries')
    .select('id, occurred_at, intent, transcript')
    .eq('user_id', userId)
    .gte('occurred_at', since.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(Math.min(args.limit ?? 25, 50));
  if (args.intent) q = q.eq('intent', args.intent);
  const { data } = await q;
  return { entries: data ?? [] };
}

// ---------- pull_intervention_window ----------

export interface InterventionWindowArgs {
  intervention_name: string;
  outcome: Metric;
  window_days?: number; // pre AND post days; default 28
}

export async function tool_pull_intervention_window(
  userId: string,
  args: InterventionWindowArgs,
) {
  const w = Math.min(Math.max(args.window_days ?? 28, 7), 60);
  const sb = createSupabaseAdmin();
  const { data: ivs } = await sb
    .from('interventions')
    .select('name, start_date')
    .eq('user_id', userId)
    .ilike('name', `%${args.intervention_name}%`)
    .order('start_date', { ascending: false })
    .limit(1);
  const iv = (ivs ?? [])[0] as { name: string; start_date: string } | undefined;
  if (!iv) {
    return { found: false, reason: `no intervention matching "${args.intervention_name}"` };
  }
  // Pull a long-enough window centered on start_date.
  const bundle = await loadSignalsBundle(userId, 90);
  const preVals: number[] = [];
  const postVals: number[] = [];
  const points: Array<{ date: string; value: number; phase: 'pre' | 'post' }> = [];
  const startDate = iv.start_date.slice(0, 10);
  const preStart = shiftDate(startDate, -w);
  const postEnd = shiftDate(startDate, w - 1);
  for (const d of bundle.macros) {
    const v = pullMetric(args.outcome, bundle, d.date);
    if (v == null) continue;
    if (d.date >= preStart && d.date < startDate) {
      preVals.push(v);
      points.push({ date: d.date, value: v, phase: 'pre' });
    } else if (d.date >= startDate && d.date <= postEnd) {
      postVals.push(v);
      points.push({ date: d.date, value: v, phase: 'post' });
    }
  }
  if (preVals.length < 3 || postVals.length < 3) {
    return {
      found: true,
      intervention: iv,
      reason: 'not enough data on both sides of the start date',
      pre_n: preVals.length,
      post_n: postVals.length,
    };
  }
  const pre = mean(preVals);
  const post = mean(postVals);
  return {
    found: true,
    intervention: iv,
    window_days: w,
    pre: { mean: round(pre, 2), sd: round(sd(preVals), 2), n: preVals.length },
    post: { mean: round(post, 2), sd: round(sd(postVals), 2), n: postVals.length },
    delta: round(post - pre, 2),
    pct_change: pre === 0 ? 0 : round((post - pre) / pre, 3),
    points,
  };
}

// ---------- make_chart ----------

// "Emit" tool — the model passes a spec; we collect the spec and
// optionally pre-render the data so the client can draw it without a
// second roundtrip. Tool result back to the model is just { ok: true }
// so it can keep narrating without echoing the spec back.

export async function tool_make_chart(userId: string, spec: ChartSpec): Promise<RenderedChartData> {
  const bundle = await loadSignalsBundle(userId, normalizeWindow(spec.window_days));
  const lag = Math.max(0, Math.floor(spec.lag_days ?? 0));

  if (spec.kind === 'line' || spec.kind === 'bar') {
    // Single x=date, y=metric series.
    const points: Array<Record<string, number | string | null>> = [];
    for (const d of bundle.macros) {
      const y = pullMetric(spec.y.metric, bundle, d.date);
      if (y == null) continue;
      const xDate = lag > 0 ? shiftDate(d.date, -lag) : d.date;
      points.push({ date: xDate, value: round(y, 2) });
    }
    return {
      spec,
      points,
      interventions: spec.intervention_markers ? bundle.interventions : undefined,
    };
  }

  if (spec.kind === 'scatter') {
    // x = metric x, y = metric y (lagged by lag_days), one point per shared day.
    const xs = new Map<string, number>();
    const ys = new Map<string, number>();
    for (const d of bundle.macros) {
      const xv = pullMetric(spec.x.metric, bundle, d.date);
      const yv = pullMetric(spec.y.metric, bundle, d.date);
      if (xv != null) xs.set(d.date, xv);
      if (yv != null) ys.set(d.date, yv);
    }
    const points: Array<Record<string, number | string | null>> = [];
    for (const [date, xv] of xs) {
      const yDate = lag > 0 ? shiftDate(date, lag) : date;
      const yv = ys.get(yDate);
      if (yv == null) continue;
      points.push({ date, x: round(xv, 2), y: round(yv, 2) });
    }
    return { spec, points };
  }

  // group_compare — bucket by group_by, return one bar per group.
  const buckets = new Map<string, number[]>();
  for (const d of bundle.macros) {
    const y = pullMetric(spec.y.metric, bundle, d.date);
    if (y == null) continue;
    let bucket: string | null = null;
    if (spec.group_by === 'workout_day') {
      bucket = (bundle.workouts.some((w) => w.week_start <= d.date) ? 'workout' : 'rest');
      // Lightweight per-day workout flag: search recent_workouts is missing
      // from the bundle, so approximate via aggregate's workouts field.
      // (The deterministic insight engine does the real cut; this is the
      // quick-look version for the model to narrate against.)
      const dayHasWorkout = (() => {
        // bundle doesn't carry per-day workout flag directly; treat the
        // weekly aggregate as a proxy and rely on the model to caveat n.
        return null;
      })();
      if (dayHasWorkout != null) bucket = dayHasWorkout;
    }
    if (!bucket) continue;
    const arr = buckets.get(bucket) ?? [];
    arr.push(y);
    buckets.set(bucket, arr);
  }
  const points = Array.from(buckets.entries()).map(([group, vs]) => ({
    group,
    mean: round(mean(vs), 2),
    n: vs.length,
  }));
  return { spec, points };
}

// ---------- helpers ----------

function pullMetric(
  metric: Metric,
  bundle: Awaited<ReturnType<typeof loadSignalsBundle>>,
  date: string,
): number | null {
  const macro = bundle.macros.find((m) => m.date === date);
  if (!macro) return null;
  switch (metric) {
    case 'protein_g':
      return macro.protein_g;
    case 'calories_kcal':
      return macro.calories_kcal;
    case 'carbs_g':
      return macro.carbs_g;
    case 'fiber_g':
      return macro.fiber_g;
    case 'sugar_g':
      return macro.sugar_g;
    case 'water_ml':
      // not in macros yet — surface 0 so the chart still draws
      return 0;
    case 'energy_score':
    case 'mood_score':
      // not in current bundle shape; aggregate doesn't roll these. The model
      // should fall back to "not enough scored data" if these are null.
      return null;
    case 'workouts': {
      // weekly bucket; bundle.workouts is per-week. Return the week's total
      // attributed to its Monday for now.
      const week = isoMonday(date);
      const row = bundle.workouts.find((w) => w.week_start === week);
      if (!row) return 0;
      return (
        row.chest + row.back + row.legs + row.shoulders + row.arms + row.core + row.full_body + row.other
      );
    }
    case 'workout_minutes':
      return null; // not aggregated yet
    case 'supplement_takes': {
      const cell = bundle.adherence.find((a) => a.date === date);
      return cell?.taken ?? 0;
    }
    case 'supplement_skips': {
      const cell = bundle.adherence.find((a) => a.date === date);
      return cell?.skipped ?? 0;
    }
    case 'supplement_adherence_pct': {
      const cell = bundle.adherence.find((a) => a.date === date);
      if (!cell || cell.total === 0) return null;
      return Math.round((cell.taken / cell.total) * 100);
    }
  }
}

function normalizeWindow(d: number): 7 | 30 | 60 | 90 {
  if (d <= 7) return 7;
  if (d <= 30) return 30;
  if (d <= 60) return 60;
  return 90;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoMonday(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function round(n: number, places: number): number {
  const p = 10 ** places;
  return Math.round(n * p) / p;
}
