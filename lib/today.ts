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
  water_oz: number;
  energy_avg: number | null;
  mood_avg: number | null;
  entry_count: number;
}

export async function fetchTodayForUser(userId: string): Promise<TodaySummary> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso } = dayBoundsPst();

  const { data: hl } = await sb
    .from('health_logs')
    .select('protein_g, calories_kcal, fiber_g, water_oz, energy_score, mood_score')
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
  let water = 0;
  const energies: number[] = [];
  const moods: number[] = [];
  for (const r of hl ?? []) {
    protein += Number(r.protein_g ?? 0);
    calories += Number(r.calories_kcal ?? 0);
    fiber += Number(r.fiber_g ?? 0);
    water += Number(r.water_oz ?? 0);
    if (typeof r.energy_score === 'number') energies.push(r.energy_score);
    if (typeof r.mood_score === 'number') moods.push(r.mood_score);
  }

  return {
    protein_g: round(protein),
    calories_kcal: Math.round(calories),
    fiber_g: round(fiber),
    water_oz: round(water),
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

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round(x: number) {
  return Math.round(x * 10) / 10;
}
