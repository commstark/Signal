import { createSupabaseAdmin } from './supabase/admin';

export type AskWindow = 'today' | '7d' | '30d';

const TZ = 'America/Los_Angeles';

function pstParts(d: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
}

function pstYmd(d: Date): string {
  const parts = pstParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${day}`;
}

function rangeFor(window: AskWindow): { startIso: string; endIso: string; label: string } {
  const now = new Date();
  const todayYmd = pstYmd(now);
  // End is start-of-tomorrow in PST.
  const endIso = new Date(`${todayYmd}T00:00:00-08:00`).toISOString();
  let days: number;
  switch (window) {
    case 'today':
      days = 1;
      break;
    case '7d':
      days = 7;
      break;
    case '30d':
      days = 30;
      break;
  }
  const startMs = new Date(endIso).getTime() - days * 24 * 60 * 60 * 1000;
  const startIso = new Date(startMs).toISOString();
  // For end label, last day = todayYmd (current day is included).
  const startYmd = pstYmd(new Date(startMs));
  return {
    startIso,
    endIso: new Date(new Date(endIso).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    label: `${startYmd} → ${todayYmd}`,
  };
}

function fmtPstTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase();
}

function fmtPstDate(iso: string): string {
  return pstYmd(new Date(iso));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export async function buildContextMarkdown(userId: string, window: AskWindow): Promise<string> {
  const sb = createSupabaseAdmin();
  const { startIso, endIso, label } = rangeFor(window);

  const [
    entriesRes,
    healthLogsRes,
    foodItemsRes,
    workoutSessionsRes,
    workoutExercisesRes,
    workoutSetsRes,
    supplementsRes,
    supplementLogsRes,
    interventionsRes,
  ] = await Promise.all([
    sb
      .from('entries')
      .select('id, occurred_at, intent, transcript, parse_status, parse_warnings')
      .eq('user_id', userId)
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso)
      .order('occurred_at', { ascending: false }),
    sb
      .from('health_logs')
      .select(
        'id, entry_id, occurred_at, protein_g, calories_kcal, fiber_g, water_ml, mood_score, mood_descriptor, energy_score, energy_descriptor, concentration_score, fullness, symptoms, free_text_notes',
      )
      .eq('user_id', userId)
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso),
    sb
      .from('food_log_items')
      .select('health_log_id, name, portion, protein_g, calories_kcal, fiber_g, water_ml')
      .eq('user_id', userId)
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso),
    sb
      .from('workout_sessions')
      .select('id, started_at, ended_at, session_notes')
      .eq('user_id', userId)
      .gte('started_at', startIso)
      .lt('started_at', endIso),
    sb
      .from('workout_exercises')
      .select('id, session_id, exercise_name, muscle_group, exercise_type, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso),
    sb
      .from('workout_sets')
      .select('exercise_id, set_number, weight_lb, reps, rpe, duration_s, distance_m, count, notes')
      .order('exercise_id', { ascending: true })
      .order('set_number', { ascending: true }),
    sb
      .from('supplements')
      .select('id, name, dose, timing, stack_group, active, notes')
      .eq('user_id', userId)
      .eq('active', true),
    sb
      .from('supplement_logs')
      .select('supplement_id, supplement_name, taken, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso),
    sb
      .from('interventions')
      .select('id, name, type, direction, started_at, ended_at, status, expected_window_days, notes')
      .eq('user_id', userId)
      .or(`status.eq.active,started_at.gte.${startIso}`),
  ]);

  const entries = entriesRes.data ?? [];
  const healthLogs = healthLogsRes.data ?? [];
  const foodItems = foodItemsRes.data ?? [];
  const sessions = workoutSessionsRes.data ?? [];
  const exercises = workoutExercisesRes.data ?? [];
  const allSets = workoutSetsRes.data ?? [];
  const supplements = supplementsRes.data ?? [];
  const supplementLogs = supplementLogsRes.data ?? [];
  const interventions = interventionsRes.data ?? [];

  // -- Aggregates ---------------------------------------------------------
  const days = window === 'today' ? 1 : window === '7d' ? 7 : 30;

  let totalProtein = 0;
  let totalCalories = 0;
  let totalFiber = 0;
  let totalWaterMl = 0;
  const energyScores: number[] = [];
  const moodScores: number[] = [];
  for (const h of healthLogs) {
    totalProtein += Number(h.protein_g ?? 0);
    totalCalories += Number(h.calories_kcal ?? 0);
    totalFiber += Number(h.fiber_g ?? 0);
    totalWaterMl += Number(h.water_ml ?? 0);
    if (typeof h.energy_score === 'number') energyScores.push(h.energy_score);
    if (typeof h.mood_score === 'number') moodScores.push(h.mood_score);
  }

  const totalMins = sessions.reduce((acc, s) => {
    if (!s.started_at || !s.ended_at) return acc;
    const ms = new Date(s.ended_at as string).getTime() - new Date(s.started_at as string).getTime();
    return acc + ms / 60_000;
  }, 0);

  const avgEnergy = energyScores.length
    ? round1(energyScores.reduce((a, b) => a + b, 0) / energyScores.length)
    : null;
  const avgMood = moodScores.length
    ? round1(moodScores.reduce((a, b) => a + b, 0) / moodScores.length)
    : null;

  // Supplement adherence: per-day, count how many of the active stack got
  // logged as taken. Adherence = days_taken / (days_in_window * stack_size).
  const stackIds = new Set(supplements.map((s) => s.id as string));
  const takenIdsByDay = new Map<string, Set<string>>();
  for (const l of supplementLogs) {
    if (!l.taken) continue;
    const day = fmtPstDate(l.occurred_at as string);
    const set = takenIdsByDay.get(day) ?? new Set<string>();
    if (l.supplement_id && stackIds.has(l.supplement_id as string)) {
      set.add(l.supplement_id as string);
    }
    takenIdsByDay.set(day, set);
  }
  const targetSlots = Math.max(1, supplements.length) * days;
  const takenSlots = Array.from(takenIdsByDay.values()).reduce((a, s) => a + s.size, 0);
  const adherencePct = supplements.length === 0 ? null : Math.round((takenSlots / targetSlots) * 100);

  // -- Markdown assembly --------------------------------------------------
  const lines: string[] = [];
  lines.push(`# Health log context`);
  lines.push(``);
  lines.push(`Range: **${label}** (${days} day${days === 1 ? '' : 's'})`);
  lines.push(`Timezone: PST (America/Los_Angeles)`);
  lines.push(``);

  lines.push(`## Summary`);
  const perDay = (v: number) => round1(v / days);
  lines.push(`- Entries logged: ${entries.length}`);
  lines.push(`- Protein: ${round1(totalProtein)} g total · ${perDay(totalProtein)} g/day avg`);
  lines.push(`- Calories: ${Math.round(totalCalories)} kcal total · ${Math.round(totalCalories / days)} kcal/day avg`);
  lines.push(`- Fiber: ${round1(totalFiber)} g total · ${perDay(totalFiber)} g/day avg`);
  lines.push(`- Water: ${round1(totalWaterMl / 1000)} L total · ${round1(totalWaterMl / 1000 / days)} L/day avg`);
  lines.push(`- Energy avg: ${avgEnergy ?? '—'} / 10 (${energyScores.length} ratings)`);
  lines.push(`- Mood avg: ${avgMood ?? '—'} / 10 (${moodScores.length} ratings)`);
  lines.push(`- Workouts: ${sessions.length} session${sessions.length === 1 ? '' : 's'}, ${Math.round(totalMins)} min total`);
  if (adherencePct != null) {
    lines.push(`- Supplement adherence: ${adherencePct}% (${supplements.length} active in stack)`);
  }
  lines.push(``);

  // -- Active interventions ----------------------------------------------
  const activeInts = interventions.filter((i) => i.status === 'active');
  if (activeInts.length) {
    lines.push(`## Active interventions`);
    for (const i of activeInts) {
      const started = fmtPstDate(i.started_at as string);
      lines.push(
        `- **${i.name}** (${i.type}) — started ${started}` +
          (i.expected_window_days ? `, expected window ${i.expected_window_days} d` : '') +
          (i.notes ? ` · ${i.notes}` : ''),
      );
    }
    lines.push(``);
  }

  // -- Supplement stack ---------------------------------------------------
  if (supplements.length) {
    lines.push(`## Active supplement stack`);
    const byGroup = new Map<string, typeof supplements>();
    for (const s of supplements) {
      const g = (s.stack_group as string | null) ?? (s.timing as string | null) ?? 'day';
      const arr = byGroup.get(g) ?? [];
      arr.push(s);
      byGroup.set(g, arr);
    }
    for (const [group, items] of byGroup) {
      lines.push(`- **${group}**: ` + items.map((s) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', '));
    }
    lines.push(``);
  }

  // -- Workouts -----------------------------------------------------------
  if (sessions.length || exercises.length) {
    lines.push(`## Workouts`);
    const sessionsById = new Map(sessions.map((s) => [s.id as string, s]));
    const setsByEx = new Map<string, typeof allSets>();
    for (const s of allSets) {
      const arr = setsByEx.get(s.exercise_id as string) ?? [];
      arr.push(s);
      setsByEx.set(s.exercise_id as string, arr);
    }
    // Group exercises by session, fall back to date if no session.
    const exBySession = new Map<string, typeof exercises>();
    for (const e of exercises) {
      const key = (e.session_id as string) ?? `loose:${fmtPstDate(e.occurred_at as string)}`;
      const arr = exBySession.get(key) ?? [];
      arr.push(e);
      exBySession.set(key, arr);
    }
    for (const [key, exs] of exBySession) {
      const sess = sessionsById.get(key);
      const dateStr = sess?.started_at
        ? `${fmtPstDate(sess.started_at as string)} ${fmtPstTime(sess.started_at as string)}`
        : fmtPstDate(exs[0].occurred_at as string);
      const dur =
        sess?.started_at && sess.ended_at
          ? Math.round(
              (new Date(sess.ended_at as string).getTime() -
                new Date(sess.started_at as string).getTime()) /
                60_000,
            )
          : null;
      lines.push(`### ${dateStr}${dur ? ` · ${dur} min` : ''}`);
      if (sess?.session_notes) lines.push(`> ${sess.session_notes}`);
      for (const e of exs) {
        const sets = setsByEx.get(e.id as string) ?? [];
        const parts: string[] = [];
        if (e.muscle_group) parts.push(String(e.muscle_group));
        if (e.exercise_type) parts.push(String(e.exercise_type));
        parts.push(`${sets.length} set${sets.length === 1 ? '' : 's'}`);
        const setDescr = sets
          .map((s) => {
            const tokens: string[] = [];
            if (s.weight_lb != null) tokens.push(`${s.weight_lb} lb`);
            if (s.reps != null) tokens.push(`× ${s.reps}`);
            if (s.duration_s != null) tokens.push(`${s.duration_s}s`);
            if (s.distance_m != null) tokens.push(`${s.distance_m}m`);
            if (s.count != null && s.reps == null) tokens.push(`× ${s.count}`);
            if (s.rpe != null) tokens.push(`@${s.rpe}`);
            return tokens.join(' ');
          })
          .filter(Boolean);
        lines.push(`- **${e.exercise_name}** — ${parts.join(' · ')}${setDescr.length ? `: ${setDescr.join(' / ')}` : ''}`);
      }
      lines.push(``);
    }
  }

  // -- Per-entry log ------------------------------------------------------
  if (entries.length) {
    lines.push(`## Entries (most recent first)`);
    const hlByEntry = new Map(healthLogs.map((h) => [h.entry_id as string, h]));
    const itemsByHl = new Map<string, typeof foodItems>();
    for (const it of foodItems) {
      const arr = itemsByHl.get(it.health_log_id as string) ?? [];
      arr.push(it);
      itemsByHl.set(it.health_log_id as string, arr);
    }
    for (const e of entries) {
      const date = fmtPstDate(e.occurred_at as string);
      const time = fmtPstTime(e.occurred_at as string);
      lines.push(
        `### ${date} ${time} · ${String(e.intent).replace(/_/g, ' ')}${
          e.parse_status && e.parse_status !== 'ok' ? ` · ${e.parse_status}` : ''
        }`,
      );
      lines.push(`> ${String(e.transcript).replace(/\n+/g, ' ')}`);
      const hl = hlByEntry.get(e.id as string);
      if (hl) {
        const macros: string[] = [];
        if (hl.protein_g != null) macros.push(`protein ${round1(Number(hl.protein_g))}g`);
        if (hl.calories_kcal != null) macros.push(`${Math.round(Number(hl.calories_kcal))} kcal`);
        if (hl.fiber_g != null) macros.push(`fiber ${round1(Number(hl.fiber_g))}g`);
        if (hl.water_ml != null) macros.push(`water ${round1(Number(hl.water_ml) / 1000)}L`);
        if (hl.energy_score != null) macros.push(`energy ${hl.energy_score}/10`);
        if (hl.mood_score != null) macros.push(`mood ${hl.mood_score}/10`);
        if (hl.concentration_score != null) macros.push(`concentration ${hl.concentration_score}/10`);
        if (hl.fullness) macros.push(`fullness ${hl.fullness}`);
        if (hl.symptoms && Array.isArray(hl.symptoms) && hl.symptoms.length) {
          macros.push(`symptoms: ${(hl.symptoms as string[]).join(', ')}`);
        }
        if (macros.length) lines.push(`- ${macros.join(' · ')}`);
        const items = itemsByHl.get(hl.id as string) ?? [];
        if (items.length) {
          lines.push(`- items: ${items.map((i) => i.name).join(', ')}`);
        }
        if (hl.free_text_notes) lines.push(`- note: ${hl.free_text_notes}`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
