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
  taken: number;
  skipped: number;
  // 0 if neither taken nor skipped logged (assumed not-recorded day).
  total: number;
}

export interface InterventionMarker {
  date: string;
  name: string;
}

export interface SignalsBundle {
  range: SignalsRange;
  start: string;
  end: string;
  macros: MacroDay[];
  workouts: WeeklyWorkoutVolume[];
  adherence: AdherenceCell[];
  interventions: InterventionMarker[];
}

const TZ = 'America/Los_Angeles';

export async function loadSignalsBundle(userId: string, days: 7 | 30 | 60 | 90 = 30, now = new Date()): Promise<SignalsBundle> {
  const sb = createSupabaseAdmin();
  const start = isoDay(addDays(now, -days));
  const end = isoDay(now);
  const startIso = `${start}T00:00:00Z`;

  const [hlRes, exRes, supRes, ivRes] = await Promise.all([
    sb
      .from('health_logs')
      .select('occurred_at, protein_g, calories_kcal, carbs_g, sugar_g, fiber_g')
      .eq('user_id', userId)
      .gte('occurred_at', startIso),
    sb
      .from('workout_exercises')
      .select('occurred_at, muscle_group')
      .eq('user_id', userId)
      .gte('occurred_at', startIso),
    sb
      .from('supplement_logs')
      .select('occurred_at, taken')
      .eq('user_id', userId)
      .gte('occurred_at', startIso),
    sb
      .from('interventions')
      .select('name, start_date')
      .eq('user_id', userId)
      .gte('start_date', start),
  ]);

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

  // Group workouts by ISO week + muscle group.
  const weekMap = new Map<string, WeeklyWorkoutVolume>();
  for (const e of (exRes.data ?? []) as Array<{ occurred_at: string; muscle_group: string | null }>) {
    const d = pstDay(e.occurred_at);
    const wk = isoMondayStr(d);
    let row = weekMap.get(wk);
    if (!row) {
      row = {
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
      weekMap.set(wk, row);
    }
    const mg = (e.muscle_group ?? 'other') as keyof Omit<WeeklyWorkoutVolume, 'week_start'>;
    if (mg in row) {
      row[mg] += 1;
    } else {
      row.other += 1;
    }
  }
  const workouts = Array.from(weekMap.values()).sort((a, b) => a.week_start.localeCompare(b.week_start));

  const adhMap = new Map<string, AdherenceCell>();
  for (const s of (supRes.data ?? []) as Array<{ occurred_at: string; taken: boolean | null }>) {
    const d = pstDay(s.occurred_at);
    const cell = adhMap.get(d) ?? { date: d, taken: 0, skipped: 0, total: 0 };
    if (s.taken) cell.taken += 1;
    else cell.skipped += 1;
    cell.total = cell.taken + cell.skipped;
    adhMap.set(d, cell);
  }
  for (let i = days; i >= 0; i--) {
    const d = isoDay(addDays(now, -i));
    if (!adhMap.has(d)) adhMap.set(d, { date: d, taken: 0, skipped: 0, total: 0 });
  }
  const adherence = Array.from(adhMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const interventions = ((ivRes.data ?? []) as Array<{ name: string; start_date: string }>)
    .map((i) => ({ date: i.start_date.slice(0, 10), name: i.name }))
    .filter((i) => i.date >= start && i.date <= end);

  return { range: { days }, start, end, macros, workouts, adherence, interventions };
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
