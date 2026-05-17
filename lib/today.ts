import { createSupabaseAdmin } from './supabase/admin';

const TZ = 'America/Los_Angeles';

export function dayBoundsPst(now = new Date()): { startIso: string; endIso: string } {
  // Compute "today" in PST by formatting in the target tz then re-parsing.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  // PST/PDT: PDT (-07:00) Mar-Nov, PST (-08:00) Nov-Mar. We don't need millisecond accuracy;
  // use -08:00 to be safe so we include the full local day.
  const startIso = new Date(`${y}-${m}-${d}T00:00:00-08:00`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60_000).toISOString();
  return { startIso, endIso };
}

export interface TodaySummary {
  protein_g: number;
  calories_kcal: number;
  fiber_g: number;
  water_ml: number;
  water_l: number;
  energy_avg: number | null;
  mood_avg: number | null;
  entry_count: number;
}

// Per-entry breakdown so the dashboard tiles can show "what made up
// today's 80g protein" when the user taps them.
export interface NutritionBreakdownRow {
  entry_id: string;
  occurred_at: string;
  protein_g: number | null;
  calories_kcal: number | null;
  fiber_g: number | null;
  water_ml: number | null;
  food_items: string[]; // names only — keep it scannable
}

export async function fetchTodayNutritionBreakdown(userId: string): Promise<NutritionBreakdownRow[]> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso } = dayBoundsPst();

  const { data: hls } = await sb
    .from('health_logs')
    .select('id, entry_id, occurred_at, protein_g, calories_kcal, fiber_g, water_ml')
    .eq('user_id', userId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso)
    .order('occurred_at', { ascending: true });

  if (!hls?.length) return [];

  const hlIds = hls.map((h) => h.id as string);
  const { data: items } = await sb
    .from('food_log_items')
    .select('health_log_id, name')
    .in('health_log_id', hlIds);

  const itemsByHl = new Map<string, string[]>();
  for (const it of items ?? []) {
    const arr = itemsByHl.get(it.health_log_id as string) ?? [];
    arr.push(it.name as string);
    itemsByHl.set(it.health_log_id as string, arr);
  }

  return hls.map((h) => ({
    entry_id: h.entry_id as string,
    occurred_at: h.occurred_at as string,
    protein_g: h.protein_g == null ? null : Number(h.protein_g),
    calories_kcal: h.calories_kcal == null ? null : Number(h.calories_kcal),
    fiber_g: h.fiber_g == null ? null : Number(h.fiber_g),
    water_ml: h.water_ml == null ? null : Number(h.water_ml),
    food_items: itemsByHl.get(h.id as string) ?? [],
  }));
}

export async function fetchTodayForUser(userId: string): Promise<TodaySummary> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso } = dayBoundsPst();

  const { data: hl } = await sb
    .from('health_logs')
    .select('protein_g, calories_kcal, fiber_g, water_ml, energy_score, mood_score')
    .eq('user_id', userId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso);

  const { count } = await sb
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso);

  let protein = 0;
  let calories = 0;
  let fiber = 0;
  let waterMl = 0;
  const energies: number[] = [];
  const moods: number[] = [];
  for (const r of hl ?? []) {
    protein += Number(r.protein_g ?? 0);
    calories += Number(r.calories_kcal ?? 0);
    fiber += Number(r.fiber_g ?? 0);
    waterMl += Number(r.water_ml ?? 0);
    if (typeof r.energy_score === 'number') energies.push(r.energy_score);
    if (typeof r.mood_score === 'number') moods.push(r.mood_score);
  }

  return {
    protein_g: round(protein),
    calories_kcal: Math.round(calories),
    fiber_g: round(fiber),
    water_ml: Math.round(waterMl),
    water_l: round(waterMl / 1000),
    energy_avg: energies.length ? round(avg(energies)) : null,
    mood_avg: moods.length ? round(avg(moods)) : null,
    entry_count: count ?? 0,
  };
}

export interface TodayEntry {
  id: string;
  occurred_at: string;
  intent: string;
  transcript: string;
  parse_status: 'ok' | 'partial' | 'failed' | 'pending' | null;
  parse_warnings: string[] | null;
}

export async function fetchTodayEntries(userId: string): Promise<TodayEntry[]> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso } = dayBoundsPst();
  const { data } = await sb
    .from('entries')
    .select('id, occurred_at, intent, transcript, parse_status, parse_warnings')
    .eq('user_id', userId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso)
    .order('occurred_at', { ascending: false });
  return (data as TodayEntry[]) ?? [];
}

export interface TodayWorkoutExercise {
  exercise_name: string;
  muscle_group: string | null;
  exercise_type: string | null;
  occurred_at: string;
  set_count: number;
  // For strength: the heaviest set (max weight, then reps as tiebreaker).
  top_set: { weight_lb: number | null; reps: number | null } | null;
  // For cardio: total duration across sets.
  total_duration_s: number | null;
  // For isometric: hold durations per set (e.g. dead hang 45s/30s/25s).
  set_durations_s: number[] | null;
}

export interface TodayWorkouts {
  session_count: number;
  total_minutes: number | null;
  exercises: TodayWorkoutExercise[];
}

export async function fetchTodayWorkouts(userId: string): Promise<TodayWorkouts> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso } = dayBoundsPst();

  const { data: sessions } = await sb
    .from('workout_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .gte('started_at', startIso)
    .lt('started_at', endIso);

  const totalMinutes = sessions?.length
    ? sessions.reduce((acc, s) => {
        if (!s.started_at || !s.ended_at) return acc;
        const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
        return acc + ms / 60_000;
      }, 0)
    : 0;

  const { data: exs } = await sb
    .from('workout_exercises')
    .select('id, exercise_name, muscle_group, exercise_type, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso)
    .order('occurred_at', { ascending: true });

  if (!exs?.length) {
    return { session_count: sessions?.length ?? 0, total_minutes: null, exercises: [] };
  }

  const exIds = exs.map((e) => e.id as string);
  const { data: sets } = await sb
    .from('workout_sets')
    .select('exercise_id, weight_lb, reps, duration_s');

  // Filter sets in memory to today's exercises only.
  const setsByEx = new Map<string, { weight_lb: number | null; reps: number | null; duration_s: number | null }[]>();
  for (const s of sets ?? []) {
    if (!exIds.includes(s.exercise_id as string)) continue;
    const arr = setsByEx.get(s.exercise_id as string) ?? [];
    arr.push({
      weight_lb: s.weight_lb as number | null,
      reps: s.reps as number | null,
      duration_s: s.duration_s as number | null,
    });
    setsByEx.set(s.exercise_id as string, arr);
  }

  const exercises: TodayWorkoutExercise[] = exs.map((e) => {
    const exSets = setsByEx.get(e.id as string) ?? [];
    const exType = (e.exercise_type as string | null) ?? null;

    // Top set: highest weight, tiebreak by reps.
    let top: { weight_lb: number | null; reps: number | null } | null = null;
    for (const s of exSets) {
      if (s.weight_lb == null) continue;
      if (!top || Number(s.weight_lb) > Number(top.weight_lb ?? 0) ||
          (Number(s.weight_lb) === Number(top.weight_lb ?? 0) && (s.reps ?? 0) > (top.reps ?? 0))) {
        top = { weight_lb: Number(s.weight_lb), reps: s.reps ?? null };
      }
    }

    // Duration aggregates.
    const dursAll = exSets
      .map((s) => (s.duration_s == null ? null : Number(s.duration_s)))
      .filter((d): d is number => d != null && d > 0);
    const totalDur = dursAll.length ? dursAll.reduce((a, b) => a + b, 0) : null;
    // Isometric: keep per-set durations so the dashboard can show "45s / 30s / 25s".
    const setDurations = exType === 'isometric' && dursAll.length ? dursAll : null;

    return {
      exercise_name: e.exercise_name as string,
      muscle_group: (e.muscle_group as string | null) ?? null,
      exercise_type: exType,
      occurred_at: e.occurred_at as string,
      set_count: exSets.length,
      top_set: top,
      total_duration_s: totalDur != null ? Math.round(totalDur) : null,
      set_durations_s: setDurations,
    };
  });

  return {
    session_count: sessions?.length ?? 0,
    total_minutes: totalMinutes > 0 ? Math.round(totalMinutes) : null,
    exercises,
  };
}

export interface TodaySupplementItem {
  id: string;
  name: string;
  dose: string | null;
  taken: boolean;
  skipped: boolean;
}

export interface TodaySupplements {
  morning: TodaySupplementItem[];
  day: TodaySupplementItem[];
  night: TodaySupplementItem[];
  // Anything the user logged today that's NOT in the canonical stack
  // AND doesn't reference a known group (morning/day/night).
  unmatched: Array<{ name: string; taken: boolean }>;
}

// Detect group-reference logs like "morning vitamin stack" or "took my
// sleep stack" and return which group they refer to. Null if it looks
// like a real one-off supplement instead.
function detectGroupReference(name: string): 'morning_stack' | 'day_stack' | 'sleep_stack' | null {
  const n = name.toLowerCase();
  const isStackPhrase = /\bstack\b|\bvitamins?\b/.test(n);
  if (!isStackPhrase) return null;
  if (/\bmorning\b/.test(n)) return 'morning_stack';
  if (/\bnight\b|\bsleep\b|\bbedtime\b|\bevening\b/.test(n)) return 'sleep_stack';
  if (/\bday\b|\bmidday\b|\blunch\b|\bnoon\b/.test(n)) return 'day_stack';
  return null;
}

export async function fetchTodaySupplements(userId: string): Promise<TodaySupplements> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso } = dayBoundsPst();

  const { data: stack } = await sb
    .from('supplements')
    .select('id, name, dose, timing, stack_group, active')
    .eq('user_id', userId)
    .eq('active', true);

  const { data: logs } = await sb
    .from('supplement_logs')
    .select('supplement_id, supplement_name, taken')
    .eq('user_id', userId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso);

  const takenIds = new Set<string>();
  const skippedIds = new Set<string>();
  const takenNames = new Set<string>();
  const skippedNames = new Set<string>();
  const takenGroups = new Set<string>();
  const skippedGroups = new Set<string>();

  for (const l of logs ?? []) {
    if (l.supplement_id) {
      (l.taken ? takenIds : skippedIds).add(l.supplement_id as string);
      continue;
    }
    if (!l.supplement_name) continue;
    const group = detectGroupReference(String(l.supplement_name));
    if (group) {
      (l.taken ? takenGroups : skippedGroups).add(group);
    } else {
      (l.taken ? takenNames : skippedNames).add(String(l.supplement_name).toLowerCase());
    }
  }

  function bucketFor(s: { stack_group: string | null; timing: string | null }):
    'morning_stack' | 'day_stack' | 'sleep_stack' {
    if (s.stack_group === 'morning_stack' || s.timing === 'morning') return 'morning_stack';
    if (s.stack_group === 'sleep_stack' || s.timing === 'night') return 'sleep_stack';
    return 'day_stack';
  }

  const morning: TodaySupplementItem[] = [];
  const day: TodaySupplementItem[] = [];
  const night: TodaySupplementItem[] = [];

  for (const s of stack ?? []) {
    const id = s.id as string;
    const nameKey = String(s.name).toLowerCase();
    const bucket = bucketFor({
      stack_group: (s.stack_group as string | null) ?? null,
      timing: (s.timing as string | null) ?? null,
    });
    const taken =
      takenIds.has(id) || takenNames.has(nameKey) || takenGroups.has(bucket);
    const skipped =
      !taken && (skippedIds.has(id) || skippedNames.has(nameKey) || skippedGroups.has(bucket));
    const item: TodaySupplementItem = {
      id,
      name: s.name as string,
      dose: (s.dose as string | null) ?? null,
      taken,
      skipped,
    };
    if (bucket === 'morning_stack') morning.push(item);
    else if (bucket === 'sleep_stack') night.push(item);
    else day.push(item);
  }

  // Logged but not in canonical stack AND not a group reference.
  const stackNames = new Set((stack ?? []).map((s) => String(s.name).toLowerCase()));
  const unmatched = (logs ?? [])
    .filter((l) => {
      if (l.supplement_id) return false;
      if (!l.supplement_name) return false;
      const n = String(l.supplement_name);
      if (stackNames.has(n.toLowerCase())) return false;
      if (detectGroupReference(n)) return false;
      return true;
    })
    .map((l) => ({ name: l.supplement_name as string, taken: !!l.taken }));

  return { morning, day, night, unmatched };
}

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round(x: number) {
  return Math.round(x * 10) / 10;
}
