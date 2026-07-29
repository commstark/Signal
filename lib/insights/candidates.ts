import type {
  Candidate,
  UserDataBundle,
  DailyAggregate,
  CorrelationMetrics,
  GroupCompareMetrics,
  InterventionWindowMetrics,
  AdherenceOutcomeMetrics,
  RecentWorkoutExercise,
} from './types';

// Thresholds — anything that doesn't clear these is dropped before the
// narrator ever sees it. Tunable as the corpus grows.
const THRESHOLDS = {
  correlation: { min_abs_r: 0.3, min_n: 15 },
  group_compare: { min_d: 0.5, min_per_group_n: 8 },
  intervention: { min_pct_change: 0.08, min_per_side_n: 6 },
  adherence: { min_d: 0.5, min_per_side_weeks: 3 },
};

const NUMERIC_METRICS = [
  'protein_g',
  'calories_kcal',
  'carbs_g',
  'fiber_g',
  'sugar_g',
  'water_ml',
  'energy_score',
  'mood_score',
  'sleep_score',
  'workouts',
] as const;
type NumericMetric = (typeof NUMERIC_METRICS)[number];

// The pairs we hunt for cross-domain signal. Listed deliberately rather
// than NxN to keep the candidate set focused on questions a user actually
// asks (e.g. "does what I eat tonight predict tomorrow's energy?").
const CORRELATION_PAIRS: Array<{ a: NumericMetric; b: NumericMetric; lag_days: number }> = [
  { a: 'protein_g', b: 'energy_score', lag_days: 0 },
  { a: 'protein_g', b: 'energy_score', lag_days: 1 },
  { a: 'sugar_g', b: 'mood_score', lag_days: 0 },
  { a: 'sugar_g', b: 'mood_score', lag_days: 1 },
  { a: 'sugar_g', b: 'energy_score', lag_days: 1 },
  { a: 'carbs_g', b: 'energy_score', lag_days: 0 },
  { a: 'carbs_g', b: 'energy_score', lag_days: 1 },
  { a: 'fiber_g', b: 'mood_score', lag_days: 1 },
  { a: 'water_ml', b: 'energy_score', lag_days: 0 },
  { a: 'workouts', b: 'mood_score', lag_days: 0 },
  { a: 'workouts', b: 'mood_score', lag_days: 1 },
  { a: 'workouts', b: 'energy_score', lag_days: 1 },
  { a: 'calories_kcal', b: 'energy_score', lag_days: 0 },
  // Sleep-based pairs — surface signal even when mood/energy aren't logged.
  { a: 'protein_g', b: 'sleep_score', lag_days: 0 },
  { a: 'water_ml', b: 'sleep_score', lag_days: 0 },
  { a: 'carbs_g', b: 'sleep_score', lag_days: 0 },
  { a: 'sugar_g', b: 'sleep_score', lag_days: 0 },
  { a: 'calories_kcal', b: 'sleep_score', lag_days: 0 },
  { a: 'workouts', b: 'sleep_score', lag_days: 1 }, // workout → better sleep next night?
  { a: 'sleep_score', b: 'workouts', lag_days: 1 }, // good sleep → more likely to work out tomorrow?
  { a: 'sleep_score', b: 'energy_score', lag_days: 0 },
  { a: 'sleep_score', b: 'mood_score', lag_days: 0 },
  // Objective-only pairs (no subjective scores required).
  { a: 'protein_g', b: 'workouts', lag_days: 1 },
  { a: 'water_ml', b: 'workouts', lag_days: 0 },
];

export function computeCandidates(bundle: UserDataBundle): Candidate[] {
  const out: Candidate[] = [];
  out.push(...correlations(bundle));
  out.push(...workoutDayCompare(bundle));
  out.push(...muscleGroupCompare(bundle));
  out.push(...interventionWindows(bundle));
  out.push(...stackAdherenceOutcome(bundle));
  // Strongest first so the narrator sees its best material up front.
  out.sort((a, b) => b.strength - a.strength);
  return out;
}

// ---------- correlation ----------

function correlations(bundle: UserDataBundle): Candidate[] {
  const days = bundle.daily_aggregates;
  if (days.length < THRESHOLDS.correlation.min_n) return [];
  const out: Candidate[] = [];
  for (const pair of CORRELATION_PAIRS) {
    const pts = pairWithLag(days, pair.a, pair.b, pair.lag_days);
    if (pts.length < THRESHOLDS.correlation.min_n) continue;
    const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y));
    if (Math.abs(r) < THRESHOLDS.correlation.min_abs_r) continue;
    const metrics: CorrelationMetrics = {
      kind: 'correlation',
      metric_a: pair.a,
      metric_b: pair.b,
      lag_days: pair.lag_days,
      n: pts.length,
      pearson_r: round(r, 3),
      window: { start: bundle.long_window.start, end: bundle.long_window.end },
    };
    out.push({
      kind: 'correlation',
      domains: domainsFor(pair.a, pair.b),
      metrics,
      evidence: {
        points: pts.map((p) => ({ x: p.x, y: p.y, date: p.date })),
      },
      strength: Math.abs(r),
    });
  }
  return out;
}

function pairWithLag(
  days: DailyAggregate[],
  a: NumericMetric,
  b: NumericMetric,
  lag: number,
): Array<{ x: number; y: number; date: string }> {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const pts: Array<{ x: number; y: number; date: string }> = [];
  for (const d of days) {
    const x = d[a];
    if (x == null) continue;
    const targetDate = shiftDate(d.date, lag);
    const target = byDate.get(targetDate);
    if (!target) continue;
    const y = target[b];
    if (y == null) continue;
    pts.push({ x: Number(x), y: Number(y), date: d.date });
  }
  return pts;
}

// ---------- group compare: workout day vs non-workout day ----------

function workoutDayCompare(bundle: UserDataBundle): Candidate[] {
  const out: Candidate[] = [];
  for (const outcome of ['energy_score', 'mood_score', 'sleep_score'] as const) {
    for (const lag of [0, 1]) {
      const byDate = new Map(bundle.daily_aggregates.map((d) => [d.date, d]));
      const workout: number[] = [];
      const rest: number[] = [];
      const workoutPts: Array<{ group: string; value: number; date: string }> = [];
      const restPts: Array<{ group: string; value: number; date: string }> = [];
      for (const d of bundle.daily_aggregates) {
        const target = byDate.get(shiftDate(d.date, lag));
        if (!target) continue;
        const v = target[outcome];
        if (v == null) continue;
        if (d.workouts > 0) {
          workout.push(v);
          workoutPts.push({ group: 'workout', value: v, date: target.date });
        } else {
          rest.push(v);
          restPts.push({ group: 'rest', value: v, date: target.date });
        }
      }
      if (
        workout.length < THRESHOLDS.group_compare.min_per_group_n ||
        rest.length < THRESHOLDS.group_compare.min_per_group_n
      )
        continue;
      const ms = mean(workout);
      const sds = sd(workout);
      const mr = mean(rest);
      const sdr = sd(rest);
      const d = cohensD(workout, rest);
      if (Math.abs(d) < THRESHOLDS.group_compare.min_d) continue;
      const metrics: GroupCompareMetrics = {
        kind: 'group_compare',
        group_var: 'workout_day',
        outcome: `${outcome}${lag ? '_next_day' : ''}`,
        groups: {
          workout: { mean: round(ms, 2), sd: round(sds, 2), n: workout.length },
          rest: { mean: round(mr, 2), sd: round(sdr, 2), n: rest.length },
        },
        delta: round(ms - mr, 2),
        cohens_d: round(d, 2),
        window: { start: bundle.long_window.start, end: bundle.long_window.end },
      };
      out.push({
        kind: 'group_compare',
        domains: ['workout', mapOutcomeToDomain(outcome)],
        metrics,
        evidence: { points: [...workoutPts, ...restPts] },
        strength: Math.abs(d),
      });
    }
  }
  return out;
}

// ---------- group compare: muscle group → next-day mood/energy/sleep ----------

function muscleGroupCompare(bundle: UserDataBundle): Candidate[] {
  const out: Candidate[] = [];
  // Map exercise occurred_at -> muscle_group for the workout days.
  const dayMuscle = new Map<string, Set<string>>(); // PST date -> set of muscle_groups
  for (const w of bundle.recent_workouts) {
    if (!w.muscle_group) continue;
    const day = pstDay(w.occurred_at);
    let set = dayMuscle.get(day);
    if (!set) {
      set = new Set();
      dayMuscle.set(day, set);
    }
    set.add(w.muscle_group);
  }
  if (dayMuscle.size < 6) return out;

  for (const outcome of ['mood_score', 'energy_score', 'sleep_score'] as const) {
    const byDate = new Map(bundle.daily_aggregates.map((d) => [d.date, d]));
    const groups: Record<string, number[]> = {};
    const pts: Array<{ group: string; value: number; date: string }> = [];
    for (const [day, muscles] of dayMuscle) {
      const next = byDate.get(shiftDate(day, 1));
      if (!next) continue;
      const v = next[outcome];
      if (v == null) continue;
      for (const m of muscles) {
        (groups[m] ??= []).push(v);
        pts.push({ group: m, value: v, date: next.date });
      }
    }
    const valid = Object.entries(groups).filter(
      ([, vs]) => vs.length >= THRESHOLDS.group_compare.min_per_group_n,
    );
    if (valid.length < 2) continue;
    // Pick the biggest gap pair (top vs bottom mean).
    const sorted = valid.map(([k, vs]) => ({ k, mean: mean(vs), sd: sd(vs), n: vs.length, vs }));
    sorted.sort((a, b) => b.mean - a.mean);
    const top = sorted[0];
    const bot = sorted[sorted.length - 1];
    if (top.k === bot.k) continue;
    const d = cohensD(top.vs, bot.vs);
    if (Math.abs(d) < THRESHOLDS.group_compare.min_d) continue;
    const metrics: GroupCompareMetrics = {
      kind: 'group_compare',
      group_var: 'workout_muscle_group',
      outcome: `${outcome}_next_day`,
      groups: Object.fromEntries(
        sorted.map((g) => [g.k, { mean: round(g.mean, 2), sd: round(g.sd, 2), n: g.n }]),
      ),
      delta: round(top.mean - bot.mean, 2),
      cohens_d: round(d, 2),
      window: { start: bundle.long_window.start, end: bundle.long_window.end },
    };
    out.push({
      kind: 'group_compare',
      domains: ['workout', mapOutcomeToDomain(outcome)],
      metrics,
      evidence: { points: pts },
      strength: Math.abs(d),
    });
  }
  return out;
}

// ---------- intervention windows ----------

function interventionWindows(bundle: UserDataBundle): Candidate[] {
  const out: Candidate[] = [];
  const byDate = new Map(bundle.daily_aggregates.map((d) => [d.date, d]));
  const WINDOW_DAYS = 28;
  const OUTCOMES: NumericMetric[] = [
    'energy_score',
    'mood_score',
    'sleep_score',
    'protein_g',
    'workouts',
    'sugar_g',
  ];

  for (const iv of bundle.interventions) {
    const start = iv.start_date.slice(0, 10);
    const preStart = shiftDate(start, -WINDOW_DAYS);
    const preEnd = shiftDate(start, -1);
    const postStart = start;
    const postEnd = shiftDate(start, WINDOW_DAYS - 1);

    for (const outcome of OUTCOMES) {
      const preVals: number[] = [];
      const postVals: number[] = [];
      const points: Array<{ date: string; value: number; phase: 'pre' | 'post' }> = [];
      for (const [date, d] of byDate) {
        const v = d[outcome];
        if (v == null) continue;
        if (date >= preStart && date <= preEnd) {
          preVals.push(Number(v));
          points.push({ date, value: Number(v), phase: 'pre' });
        } else if (date >= postStart && date <= postEnd) {
          postVals.push(Number(v));
          points.push({ date, value: Number(v), phase: 'post' });
        }
      }
      if (
        preVals.length < THRESHOLDS.intervention.min_per_side_n ||
        postVals.length < THRESHOLDS.intervention.min_per_side_n
      )
        continue;
      const pre = mean(preVals);
      const post = mean(postVals);
      const delta = post - pre;
      const pct = pre === 0 ? 0 : delta / pre;
      if (Math.abs(pct) < THRESHOLDS.intervention.min_pct_change) continue;
      const metrics: InterventionWindowMetrics = {
        kind: 'intervention_window',
        intervention_name: iv.name,
        direction: iv.direction === 'change' ? 'start' : iv.direction,
        start_date: start,
        outcome,
        pre: {
          mean: round(pre, 2),
          sd: round(sd(preVals), 2),
          n: preVals.length,
          window_days: WINDOW_DAYS,
        },
        post: {
          mean: round(post, 2),
          sd: round(sd(postVals), 2),
          n: postVals.length,
          window_days: WINDOW_DAYS,
        },
        delta: round(delta, 2),
        pct_change: round(pct, 3),
      };
      out.push({
        kind: 'intervention_window',
        domains: ['intervention', mapOutcomeToDomain(outcome)],
        metrics,
        evidence: { points },
        strength: Math.abs(pct),
      });
    }
  }
  return out;
}

// ---------- adherence × outcome (weekly buckets) ----------

function stackAdherenceOutcome(bundle: UserDataBundle): Candidate[] {
  const out: Candidate[] = [];
  // Group daily aggregates by ISO week and compute adherence + outcome means.
  const weeks = new Map<
    string,
    { adherence: number; takes: number; total: number; energy: number[]; mood: number[]; sleep: number[] }
  >();
  for (const d of bundle.daily_aggregates) {
    const week = isoWeek(d.date);
    let w = weeks.get(week);
    if (!w) {
      w = { adherence: 0, takes: 0, total: 0, energy: [], mood: [], sleep: [] };
      weeks.set(week, w);
    }
    w.takes += d.supplement_takes;
    w.total += d.supplement_takes + d.supplement_skips;
    if (d.energy_score != null) w.energy.push(d.energy_score);
    if (d.mood_score != null) w.mood.push(d.mood_score);
    if (d.sleep_score != null) w.sleep.push(d.sleep_score);
  }
  for (const w of weeks.values()) {
    w.adherence = w.total > 0 ? w.takes / w.total : 0;
  }
  const weekList = Array.from(weeks.entries())
    .filter(([, w]) => w.total >= 3)
    .map(([k, w]) => ({ week_start: k, ...w }));
  if (weekList.length < THRESHOLDS.adherence.min_per_side_weeks * 2) return out;

  const median = quantile(
    weekList.map((w) => w.adherence),
    0.5,
  );
  const high = weekList.filter((w) => w.adherence >= median);
  const low = weekList.filter((w) => w.adherence < median);

  for (const outcome of ['energy', 'mood', 'sleep'] as const) {
    const hi = high.flatMap((w) => w[outcome]);
    const lo = low.flatMap((w) => w[outcome]);
    if (
      hi.length < THRESHOLDS.adherence.min_per_side_weeks ||
      lo.length < THRESHOLDS.adherence.min_per_side_weeks
    )
      continue;
    const d = cohensD(hi, lo);
    if (Math.abs(d) < THRESHOLDS.adherence.min_d) continue;
    const metrics: AdherenceOutcomeMetrics = {
      kind: 'adherence_outcome',
      intervention_name: 'stack adherence',
      outcome: outcome === 'sleep' ? 'sleep_score' : `${outcome}_score`,
      high_adherence: {
        mean: round(mean(hi), 2),
        sd: round(sd(hi), 2),
        n_weeks: high.length,
      },
      low_adherence: {
        mean: round(mean(lo), 2),
        sd: round(sd(lo), 2),
        n_weeks: low.length,
      },
      delta: round(mean(hi) - mean(lo), 2),
      cohens_d: round(d, 2),
    };
    out.push({
      kind: 'adherence_outcome',
      domains: ['supplement', outcome === 'sleep' ? 'sleep' : outcome],
      metrics,
      evidence: {
        points: weekList.map((w) => ({
          week_start: w.week_start,
          adherence: round(w.adherence, 2),
          outcome: outcome === 'energy' ? round(mean(w.energy), 2) : outcome === 'mood' ? round(mean(w.mood), 2) : round(mean(w.sleep), 2),
        })),
      },
      strength: Math.abs(d),
    });
  }
  return out;
}

// ---------- math + helpers ----------

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

function cohensD(a: number[], b: number[]): number {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  const sa = sd(a);
  const sb = sd(b);
  // Pooled SD.
  const pooled = Math.sqrt(((na - 1) * sa * sa + (nb - 1) * sb * sb) / (na + nb - 2));
  return pooled === 0 ? 0 : (ma - mb) / pooled;
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

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pstDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function isoWeek(ymd: string): string {
  // First day of ISO week (Monday). Returned as YYYY-MM-DD.
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function round(n: number, places = 2): number {
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

function domainsFor(a: NumericMetric, b: NumericMetric): string[] {
  return [mapOutcomeToDomain(a), mapOutcomeToDomain(b)];
}

function mapOutcomeToDomain(metric: NumericMetric): string {
  switch (metric) {
    case 'energy_score':
      return 'energy';
    case 'mood_score':
      return 'mood';
    case 'sleep_score':
      return 'sleep';
    case 'workouts':
      return 'workout';
    default:
      return 'nutrition';
  }
}

// Re-export for the eval harness.
export const _internals = { pearson, cohensD, mean, sd, isoWeek, shiftDate };
// Suppress "RecentWorkoutExercise unused" — kept for future per-set extensions.
export type _ = RecentWorkoutExercise;
