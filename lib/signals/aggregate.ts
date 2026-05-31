import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface SignalsRange {
  days: 7 | 30 | 60 | 90;
}

export interface MacroDay {
  date: string; // YYYY-MM-DD in PST
  protein_g: number;
  calories_kcal: number;
  carbs_g: number;
  sugar_g: number;
  fiber_g: number;
}

export interface WeeklyWorkoutVolume {
  week_start: string; // ISO Monday
  chest: number;
  back: number;
  legs: number;
  shoulders: number;
  arms: number;
  core: number;
  full_body: number;
  other: number;
}

export interface AdherenceCell {
  date: string; // YYYY-MM-DD
  // Stack-anchored counts: numerator/denominator are based on the user's
  // current active stack, not just what was logged. So "I take 14 of 14"
  // reads as 100% only if everything in your stack got logged as taken.
  taken: number;
  total: number; // stack size at read time
  skipped: number; // diagnostic only — doesn't change taken/total
  taken_items: string[];
  skipped_items: string[];
  // Items that are in the active stack but weren't logged either way that
  // day. Surfaced in the popup so you can see exactly what slipped.
  missing_items: string[];
}

export interface InterventionMarker {
  date: string;
  name: string;
}

export interface WorkoutDay {
  date: string; // YYYY-MM-DD in PST
  exercises: Array<{
    name: string;
    muscle_group: string | null;
    exercise_type: string | null;
    top_weight_lb: number | null;
    top_reps: number | null;
    total_duration_s: number | null;
  }>;
}

export interface SignalsBundle {
  range: SignalsRange;
  start: string;
  end: string;
  macros: MacroDay[];
  workouts: WeeklyWorkoutVolume[];
  workout_days: WorkoutDay[];
  adherence: AdherenceCell[];
  interventions: InterventionMarker[];
}

const TZ = 'America/Los_Angeles';

export async function loadSignalsBundle(userId: string, days: 7 | 30 | 60 | 90 = 30, now = new Date()): Promise<SignalsBundle> {
  const sb = createSupabaseAdmin();
  const start = isoDay(addDays(now, -days));
  const end = isoDay(now);
  const startIso = `${start}T00:00:00Z`;

  const [hlRes, exRes, supRes, ivRes, stackRes] = await Promise.all([
    sb
      .from('health_logs')
      .select('occurred_at, protein_g, calories_kcal, carbs_g, sugar_g, fiber_g')
      .eq('user_id', userId)
      .gte('occurred_at', startIso),
    sb
      .from('workout_exercises')
      .select('id, occurred_at, exercise_name, muscle_group, exercise_type')
      .eq('user_id', userId)
      .gte('occurred_at', startIso),
    sb
      .from('supplement_logs')
      .select('occurred_at, taken, supplement_name')
      .eq('user_id', userId)
      .gte('occurred_at', startIso),
    sb
      .from('interventions')
      .select('name, start_date')
      .eq('user_id', userId)
      .gte('start_date', start),
    sb
      .from('supplements')
      .select('name')
      .eq('user_id', userId)
      .eq('active', true),
  ]);

  const activeStack = ((stackRes.data ?? []) as Array<{ name: string }>)
    .map((s) => String(s.name).trim())
    .filter(Boolean);
  const stackLowerToCanonical = new Map<string, string>();
  for (const name of activeStack) stackLowerToCanonical.set(name.toLowerCase(), name);

  const macroMap = new Map<string, MacroDay>();
  for (const h of (hlRes.data ?? []) as Array<{
    occurred_at: string;
    protein_g: number | null;
    calories_kcal: number | null;
    carbs_g: number | null;
    sugar_g: number | null;
    fiber_g: number | null;
  }>) {
    const d = pstDay(h.occurred_at);
    const m = macroMap.get(d) ?? {
      date: d,
      protein_g: 0,
      calories_kcal: 0,
      carbs_g: 0,
      sugar_g: 0,
      fiber_g: 0,
    };
    m.protein_g += Number(h.protein_g ?? 0);
    m.calories_kcal += Number(h.calories_kcal ?? 0);
    m.carbs_g += Number(h.carbs_g ?? 0);
    m.sugar_g += Number(h.sugar_g ?? 0);
    m.fiber_g += Number(h.fiber_g ?? 0);
    macroMap.set(d, m);
  }
  // Fill in zero-rows for days with no entries so the line draws continuous.
  for (let i = days; i >= 0; i--) {
    const d = isoDay(addDays(now, -i));
    if (!macroMap.has(d)) {
      macroMap.set(d, { date: d, protein_g: 0, calories_kcal: 0, carbs_g: 0, sugar_g: 0, fiber_g: 0 });
    }
  }
  const macros = Array.from(macroMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const exerciseRows = (exRes.data ?? []) as Array<{
    id: string;
    occurred_at: string;
    exercise_name: string;
    muscle_group: string | null;
    exercise_type: string | null;
  }>;

  // Pull workout_sets for the exercises we picked up so the day detail
  // panel can show "Bench · top set 225×6 · 12 min" rather than just a name.
  const exIds = exerciseRows.map((e) => e.id);
  const { data: setsData } = exIds.length
    ? await sb
        .from('workout_sets')
        .select('exercise_id, weight_lb, reps, duration_s')
        .in('exercise_id', exIds)
    : { data: [] as Array<{ exercise_id: string; weight_lb: number | null; reps: number | null; duration_s: number | null }> };
  const setsByEx = new Map<
    string,
    Array<{ weight_lb: number | null; reps: number | null; duration_s: number | null }>
  >();
  for (const s of setsData ?? []) {
    const arr = setsByEx.get(s.exercise_id as string) ?? [];
    arr.push({
      weight_lb: s.weight_lb as number | null,
      reps: s.reps as number | null,
      duration_s: s.duration_s as number | null,
    });
    setsByEx.set(s.exercise_id as string, arr);
  }

  // Group workouts by ISO week + muscle group (kept for the legacy bar
  // chart's data shape + the make_chart / query_metric `workouts` tool).
  const weekMap = new Map<string, WeeklyWorkoutVolume>();
  // Group workouts by PST day for the new "did I work out?" view.
  const dayMap = new Map<string, WorkoutDay>();
  for (const e of exerciseRows) {
    const d = pstDay(e.occurred_at);
    const wk = isoMondayStr(d);
    let wRow = weekMap.get(wk);
    if (!wRow) {
      wRow = {
        week_start: wk,
        chest: 0,
        back: 0,
        legs: 0,
        shoulders: 0,
        arms: 0,
        core: 0,
        full_body: 0,
        other: 0,
      };
      weekMap.set(wk, wRow);
    }
    const mg = (e.muscle_group ?? 'other') as keyof Omit<WeeklyWorkoutVolume, 'week_start'>;
    if (mg in wRow) wRow[mg] += 1;
    else wRow.other += 1;

    let dRow = dayMap.get(d);
    if (!dRow) {
      dRow = { date: d, exercises: [] };
      dayMap.set(d, dRow);
    }
    const sets = setsByEx.get(e.id) ?? [];
    let top: { weight_lb: number | null; reps: number | null } | null = null;
    let totalDur = 0;
    for (const s of sets) {
      if (s.weight_lb != null) {
        const w = Number(s.weight_lb);
        if (!top || w > (top.weight_lb ?? 0)) top = { weight_lb: w, reps: s.reps };
      }
      if (s.duration_s != null) totalDur += Number(s.duration_s);
    }
    dRow.exercises.push({
      name: e.exercise_name,
      muscle_group: e.muscle_group,
      exercise_type: e.exercise_type,
      top_weight_lb: top?.weight_lb ?? null,
      top_reps: top?.reps ?? null,
      total_duration_s: totalDur > 0 ? totalDur : null,
    });
  }
  const workouts = Array.from(weekMap.values()).sort((a, b) => a.week_start.localeCompare(b.week_start));
  const workout_days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Per-day take / skip name sets, lowercased for matching against stack.
  const dayTaken = new Map<string, Set<string>>();
  const daySkipped = new Map<string, Set<string>>();
  for (const s of (supRes.data ?? []) as Array<{
    occurred_at: string;
    taken: boolean | null;
    supplement_name: string | null;
  }>) {
    const d = pstDay(s.occurred_at);
    const lower = (s.supplement_name ?? '').trim().toLowerCase();
    if (!lower) continue;
    const bucket = s.taken ? dayTaken : daySkipped;
    let set = bucket.get(d);
    if (!set) {
      set = new Set();
      bucket.set(d, set);
    }
    set.add(lower);
  }

  const adherence: AdherenceCell[] = [];
  const stackSize = activeStack.length;
  for (let i = days; i >= 0; i--) {
    const d = isoDay(addDays(now, -i));
    const takenSet = dayTaken.get(d) ?? new Set();
    const skippedSet = daySkipped.get(d) ?? new Set();
    const taken_items: string[] = [];
    const skipped_items: string[] = [];
    const missing_items: string[] = [];
    if (stackSize > 0) {
      // Walk the stack, classifying each by whether the user logged it
      // taken / skipped / not-at-all that day.
      for (const name of activeStack) {
        const lower = name.toLowerCase();
        if (takenSet.has(lower)) taken_items.push(name);
        else if (skippedSet.has(lower)) skipped_items.push(name);
        else missing_items.push(name);
      }
    } else {
      // No defined stack yet — fall back to raw log names so the user still
      // sees their per-day activity even before they curate /stack.
      for (const lower of takenSet) taken_items.push(stackLowerToCanonical.get(lower) ?? lower);
      for (const lower of skippedSet) skipped_items.push(stackLowerToCanonical.get(lower) ?? lower);
    }
    const total = stackSize > 0 ? stackSize : taken_items.length + skipped_items.length;
    const hasAnyLog = takenSet.size + skippedSet.size > 0;
    adherence.push({
      date: d,
      taken: taken_items.length,
      total: hasAnyLog || stackSize > 0 ? total : 0,
      skipped: skipped_items.length,
      taken_items,
      skipped_items,
      missing_items,
    });
  }

  const interventions = ((ivRes.data ?? []) as Array<{ name: string; start_date: string }>)
    .map((i) => ({ date: i.start_date.slice(0, 10), name: i.name }))
    .filter((i) => i.date >= start && i.date <= end);

  return {
    range: { days },
    start,
    end,
    macros,
    workouts,
    workout_days,
    adherence,
    interventions,
  };
}

function pstDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function isoDay(d: Date): string {
  // Local PST day to match the rest of the app's day boundaries.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isoMondayStr(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
