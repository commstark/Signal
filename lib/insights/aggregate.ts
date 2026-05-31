import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  UserDataBundle,
  DailyAggregate,
  RecentEntry,
  RecentFoodItem,
  RecentWorkoutExercise,
  RecentSupplementLog,
  InterventionRow,
} from './types';

const SHORT_WINDOW_DAYS = 7;
const LONG_WINDOW_DAYS = 84; // 12 weeks

// Pulls everything the candidate computers + Sonnet narrator need for a
// single user. Read-only.
export async function aggregateUserData(userId: string, now = new Date()): Promise<UserDataBundle> {
  const sb = createSupabaseAdmin();

  const shortStart = isoDay(addDays(now, -SHORT_WINDOW_DAYS));
  const longStart = isoDay(addDays(now, -LONG_WINDOW_DAYS));
  const end = isoDay(now);

  const [
    entriesRes,
    foodRes,
    exercisesRes,
    setsRes,
    suppRes,
    healthRes,
    interventionsRes,
    userRes,
    medRes,
    feedbackRes,
  ] = await Promise.all([
    sb
      .from('entries')
      .select('id, occurred_at, intent, transcript')
      .eq('user_id', userId)
      .gte('occurred_at', shortStart)
      .order('occurred_at', { ascending: true }),
    sb
      .from('food_log_items')
      .select('occurred_at, name, protein_g, calories_kcal, carbs_g, fiber_g, sugar_g')
      .eq('user_id', userId)
      .gte('occurred_at', shortStart)
      .order('occurred_at', { ascending: true }),
    sb
      .from('workout_exercises')
      .select('id, occurred_at, exercise_name, muscle_group, exercise_type')
      .eq('user_id', userId)
      .gte('occurred_at', longStart),
    sb
      .from('workout_sets')
      .select('exercise_id, weight_lb, reps, duration_s'),
    sb
      .from('supplement_logs')
      .select('occurred_at, supplement_name, taken')
      .eq('user_id', userId)
      .gte('occurred_at', longStart),
    sb
      .from('health_logs')
      .select(
        'occurred_at, protein_g, calories_kcal, carbs_g, fiber_g, sugar_g, water_ml, energy_score, mood_score',
      )
      .eq('user_id', userId)
      .gte('occurred_at', longStart),
    sb
      .from('interventions')
      .select('id, name, type, direction, start_date, end_date, active')
      .eq('user_id', userId)
      .gte('start_date', longStart),
    sb.from('users').select('profile_md').eq('id', userId).maybeSingle(),
    sb
      .from('medical_documents')
      .select('extracted_text')
      .eq('user_id', userId)
      .not('extracted_text', 'is', null),
    sb
      .from('insight_feedback')
      .select('verdict, note, weekly_insights(headline)')
      .eq('user_id', userId)
      .gte('created_at', isoDay(addDays(now, -28)))
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const exercises = (exercisesRes.data ?? []) as Array<{
    id: string;
    occurred_at: string;
    exercise_name: string;
    muscle_group: string | null;
    exercise_type: string | null;
  }>;
  const exIds = new Set(exercises.map((e) => e.id));
  const setsByEx = new Map<string, Array<{ weight_lb: number | null; reps: number | null; duration_s: number | null }>>();
  for (const s of (setsRes.data ?? []) as Array<{
    exercise_id: string;
    weight_lb: number | null;
    reps: number | null;
    duration_s: number | null;
  }>) {
    if (!exIds.has(s.exercise_id)) continue;
    const arr = setsByEx.get(s.exercise_id) ?? [];
    arr.push({ weight_lb: s.weight_lb, reps: s.reps, duration_s: s.duration_s });
    setsByEx.set(s.exercise_id, arr);
  }

  const recent_workouts: RecentWorkoutExercise[] = exercises.map((e) => {
    const sets = setsByEx.get(e.id) ?? [];
    let top: { weight_lb: number; reps: number | null } | null = null;
    let totalDur = 0;
    for (const s of sets) {
      if (s.weight_lb != null) {
        const w = Number(s.weight_lb);
        if (!top || w > top.weight_lb) top = { weight_lb: w, reps: s.reps };
      }
      if (s.duration_s != null) totalDur += Number(s.duration_s);
    }
    return {
      occurred_at: e.occurred_at,
      exercise_name: e.exercise_name,
      muscle_group: e.muscle_group,
      exercise_type: e.exercise_type,
      top_weight_lb: top?.weight_lb ?? null,
      top_reps: top?.reps ?? null,
      total_duration_s: totalDur > 0 ? totalDur : null,
    };
  });

  // Roll daily aggregates from health_logs + workout/supplement counts.
  const dailyMap = new Map<string, DailyAggregate>();
  for (const h of (healthRes.data ?? []) as Array<{
    occurred_at: string;
    protein_g: number | null;
    calories_kcal: number | null;
    carbs_g: number | null;
    fiber_g: number | null;
    sugar_g: number | null;
    water_ml: number | null;
    energy_score: number | null;
    mood_score: number | null;
  }>) {
    const day = pstDay(h.occurred_at);
    const d = ensureDay(dailyMap, day);
    d.protein_g += Number(h.protein_g ?? 0);
    d.calories_kcal += Number(h.calories_kcal ?? 0);
    d.carbs_g += Number(h.carbs_g ?? 0);
    d.fiber_g += Number(h.fiber_g ?? 0);
    d.sugar_g += Number(h.sugar_g ?? 0);
    d.water_ml += Number(h.water_ml ?? 0);
    if (typeof h.energy_score === 'number') {
      d.energy_score = d.energy_score == null ? h.energy_score : (d.energy_score + h.energy_score) / 2;
    }
    if (typeof h.mood_score === 'number') {
      d.mood_score = d.mood_score == null ? h.mood_score : (d.mood_score + h.mood_score) / 2;
    }
  }
  for (const w of recent_workouts) {
    const day = pstDay(w.occurred_at);
    if (!isWithin(day, longStart, end)) continue;
    ensureDay(dailyMap, day).workouts += 1;
  }
  for (const s of (suppRes.data ?? []) as Array<{
    occurred_at: string;
    taken: boolean | null;
  }>) {
    const day = pstDay(s.occurred_at);
    const d = ensureDay(dailyMap, day);
    if (s.taken) d.supplement_takes += 1;
    else d.supplement_skips += 1;
  }

  const daily_aggregates = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    user_id: userId,
    window: { start: shortStart, end },
    long_window: { start: longStart, end },
    recent_entries: (entriesRes.data ?? []) as RecentEntry[],
    recent_food_items: (foodRes.data ?? []) as RecentFoodItem[],
    recent_workouts,
    recent_supplements: ((suppRes.data ?? []) as Array<{
      occurred_at: string;
      supplement_name: string | null;
      taken: boolean | null;
    }>)
      .filter((s) => s.supplement_name)
      .map((s) => ({
        occurred_at: s.occurred_at,
        supplement_name: s.supplement_name as string,
        taken: !!s.taken,
      })) as RecentSupplementLog[],
    daily_aggregates,
    interventions: (interventionsRes.data ?? []) as InterventionRow[],
    profile_md: (userRes.data?.profile_md ?? null) as string | null,
    medical_docs_text: ((medRes.data ?? []) as Array<{ extracted_text: string | null }>)
      .map((d) => d.extracted_text ?? '')
      .filter(Boolean)
      .join('\n\n---\n\n') || null,
    recent_feedback: ((feedbackRes.data ?? []) as Array<{
      verdict: 'up' | 'down' | 'wrong';
      note: string | null;
      weekly_insights: { headline: string } | { headline: string }[] | null;
    }>)
      .map((row) => {
        const wi = row.weekly_insights;
        const headline = Array.isArray(wi) ? wi[0]?.headline : wi?.headline;
        return headline ? { headline, verdict: row.verdict, note: row.note } : null;
      })
      .filter((x): x is { headline: string; verdict: 'up' | 'down' | 'wrong'; note: string | null } => !!x),
  };
}

function ensureDay(map: Map<string, DailyAggregate>, date: string): DailyAggregate {
  let d = map.get(date);
  if (!d) {
    d = {
      date,
      protein_g: 0,
      calories_kcal: 0,
      carbs_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      water_ml: 0,
      energy_score: null,
      mood_score: null,
      workouts: 0,
      supplement_takes: 0,
      supplement_skips: 0,
    };
    map.set(date, d);
  }
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isoDay(d: Date): string {
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

function isWithin(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}
