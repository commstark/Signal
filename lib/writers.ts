import { createSupabaseAdmin } from './supabase/admin';
import type {
  HealthLogParsed,
  WorkoutLogParsed,
  SupplementLogParsed,
  InterventionParsed,
  PreferenceParsed,
  MuscleGroup,
  ExerciseType,
} from './types';
import type { TargetParsed } from './prompts/parse-target';

type Admin = ReturnType<typeof createSupabaseAdmin>;

// Non-throwing write contract. Writers collect partial-write warnings and
// surface them so /api/parse can mark the entry as 'partial' rather than
// 500-ing on a single bad column.
export interface WriteResult {
  ok: boolean;
  warnings: string[];
}

function clampScore(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const int = Math.round(n);
  if (int < 1 || int > 10) return null;
  return int;
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (typeof v !== 'string') return null;
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function asArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function clampNumeric(v: unknown, max: number): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 0 || n > max) return null;
  return n;
}

function clampInt(v: unknown, min: number, max: number): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const int = Math.round(n);
  if (int < min || int > max) return null;
  return int;
}

const CARB_TIMINGS = ['morning', 'midday', 'evening', 'late_night'] as const;
const FULLNESS = ['hungry', 'satisfied', 'full', 'stuffed'] as const;
const CONFIDENCE = ['high', 'medium', 'low'] as const;
const MUSCLE_GROUPS = [
  'chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body',
] as const satisfies readonly MuscleGroup[];
const EXERCISE_TYPES = [
  'strength', 'cardio', 'conditioning', 'mobility', 'isometric',
] as const satisfies readonly ExerciseType[];

async function findActiveInterventionId(
  sb: Admin,
  userId: string,
  occurredAt: string,
): Promise<string | null> {
  const { data } = await sb
    .from('interventions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('started_at', occurredAt)
    .order('started_at', { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

export async function writeHealthLog(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: HealthLogParsed;
}): Promise<WriteResult> {
  const warnings: string[] = [];
  const sb = createSupabaseAdmin();
  const interventionId = await findActiveInterventionId(sb, args.userId, args.occurredAt);
  const n = args.parsed.estimated_nutrition ?? ({} as Partial<HealthLogParsed['estimated_nutrition']>);

  const { data: hl, error } = await sb
    .from('health_logs')
    .insert({
      entry_id: args.entryId,
      user_id: args.userId,
      occurred_at: args.occurredAt,
      intervention_id: interventionId,
      protein_g: clampNumeric(n.protein_g, 9999),
      calories_kcal: clampNumeric(n.calories_kcal, 99999),
      fiber_g: clampNumeric(n.fiber_g, 9999),
      sugar_g: clampNumeric(n.sugar_g, 9999),
      added_sugars_g: clampNumeric(n.added_sugars_g, 9999),
      carbs_g: clampNumeric(n.carbs_g, 9999),
      saturated_fat_present: typeof n.saturated_fat_present === 'boolean' ? n.saturated_fat_present : null,
      carb_timing: asEnum(n.carb_timing, CARB_TIMINGS),
      ultra_processed: typeof n.ultra_processed === 'boolean' ? n.ultra_processed : null,
      nutrition_confidence: asEnum(n.confidence, CONFIDENCE),
      mood_score: clampScore(args.parsed.mood?.score),
      mood_descriptor: args.parsed.mood?.descriptor ?? null,
      energy_score: clampScore(args.parsed.energy?.score),
      energy_descriptor: args.parsed.energy?.descriptor ?? null,
      concentration_score: clampScore(args.parsed.concentration?.score),
      fullness: asEnum(args.parsed.fullness, FULLNESS),
      symptoms: asArray(args.parsed.symptoms),
      water_ml: clampNumeric(args.parsed.water_ml, 30000),
      free_text_notes: args.parsed.free_text_notes ?? null,
    })
    .select('id')
    .single();

  if (error || !hl) {
    warnings.push(`health_logs insert failed: ${error?.message ?? 'unknown'}`);
    return { ok: false, warnings };
  }

  if (args.parsed.food_items?.length) {
    const items = args.parsed.food_items.map((f) => ({
      health_log_id: hl.id,
      user_id: args.userId,
      name: f.name,
      canonical_tag: f.canonical_tag,
      portion: f.portion,
      notes: f.notes,
      protein_g: clampNumeric(f.protein_g, 9999),
      calories_kcal: clampNumeric(f.calories_kcal, 99999),
      fiber_g: clampNumeric(f.fiber_g, 9999),
      water_ml: clampNumeric(f.water_ml, 30000),
      sugar_g: clampNumeric(f.sugar_g, 9999),
      added_sugars_g: clampNumeric(f.added_sugars_g, 9999),
      carbs_g: clampNumeric(f.carbs_g, 9999),
      occurred_at: args.occurredAt,
    }));
    const { error: e } = await sb.from('food_log_items').insert(items);
    if (e) warnings.push(`food_log_items insert failed: ${e.message}`);
  }

  return { ok: true, warnings };
}

export async function writeWorkoutLog(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: WorkoutLogParsed;
}): Promise<WriteResult> {
  const warnings: string[] = [];
  const sb = createSupabaseAdmin();
  const interventionId = await findActiveInterventionId(sb, args.userId, args.occurredAt);

  // If the entry has no exercises, don't touch workout_sessions at all.
  // Otherwise a 'mixed' intent with food-only content used to leave an
  // orphan "1 session · 0 exercises" row on /today.
  if (!args.parsed.exercises?.length) {
    return { ok: true, warnings };
  }

  // Session is grouped within a 90-min window. We treat all exercises from
  // one entry as part of one session.
  const ninetyAgo = new Date(new Date(args.occurredAt).getTime() - 90 * 60_000).toISOString();
  const { data: existing } = await sb
    .from('workout_sessions')
    .select('id')
    .eq('user_id', args.userId)
    .gte('started_at', ninetyAgo)
    .order('started_at', { ascending: false })
    .limit(1);

  let sessionId: string;
  if (existing && existing.length) {
    sessionId = existing[0].id;
    if (args.parsed.session_notes) {
      await sb
        .from('workout_sessions')
        .update({ session_notes: args.parsed.session_notes, ended_at: args.occurredAt })
        .eq('id', sessionId);
    }
  } else {
    const { data: created, error } = await sb
      .from('workout_sessions')
      .insert({
        user_id: args.userId,
        started_at: args.occurredAt,
        ended_at: args.occurredAt,
        session_notes: args.parsed.session_notes,
      })
      .select('id')
      .single();
    if (error || !created) {
      warnings.push(`workout_sessions insert failed: ${error?.message ?? 'unknown'}`);
      return { ok: false, warnings };
    }
    sessionId = created.id;
  }

  let anyExerciseWritten = false;
  for (const ex of args.parsed.exercises) {
    if (!ex?.exercise_name) {
      warnings.push('skipped exercise with no name');
      continue;
    }
    const { data: created, error } = await sb
      .from('workout_exercises')
      .insert({
        session_id: sessionId,
        entry_id: args.entryId,
        user_id: args.userId,
        intervention_id: interventionId,
        exercise_name: ex.exercise_name,
        muscle_group: asEnum(ex.muscle_group, MUSCLE_GROUPS),
        exercise_type: asEnum(ex.exercise_type ?? null, EXERCISE_TYPES),
        occurred_at: args.occurredAt,
      })
      .select('id')
      .single();
    if (error || !created) {
      warnings.push(`workout_exercises insert failed (${ex.exercise_name}): ${error?.message ?? 'unknown'}`);
      continue;
    }
    anyExerciseWritten = true;

    if (ex.sets?.length) {
      const sets = ex.sets.map((s, i) => ({
        exercise_id: created.id,
        set_number: i + 1,
        weight_lb: clampNumeric(s.weight_lb, 9999),
        reps: clampInt(s.reps, 0, 1000),
        rpe: clampNumeric(s.rpe, 10),
        duration_s: clampNumeric(s.duration_s, 86400),
        distance_m: clampNumeric(s.distance_m, 1_000_000),
        count: clampInt(s.count, 0, 100000),
        notes: typeof s.notes === 'string' ? s.notes : null,
      }));
      const { error: e2 } = await sb.from('workout_sets').insert(sets);
      if (e2) {
        warnings.push(`workout_sets insert failed (${ex.exercise_name}): ${e2.message}`);
      }
    }
  }

  return { ok: anyExerciseWritten, warnings };
}

export async function writeSupplementLog(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: SupplementLogParsed;
}): Promise<WriteResult & { candidate_intervention?: SupplementLogParsed['candidate_intervention'] }> {
  const warnings: string[] = [];
  const sb = createSupabaseAdmin();
  const interventionId = await findActiveInterventionId(sb, args.userId, args.occurredAt);

  if (args.parsed.logs?.length) {
    const rows = args.parsed.logs
      .filter((l) => l && typeof l.supplement_name === 'string' && l.supplement_name.trim())
      .map((l) => ({
        user_id: args.userId,
        entry_id: args.entryId,
        supplement_id: l.supplement_id,
        intervention_id: interventionId,
        supplement_name: l.supplement_name,
        occurred_at: args.occurredAt,
        taken: typeof l.taken === 'boolean' ? l.taken : true,
        notes: typeof l.notes === 'string' ? l.notes : null,
      }));
    if (rows.length) {
      const { error } = await sb.from('supplement_logs').insert(rows);
      if (error) {
        warnings.push(`supplement_logs insert failed: ${error.message}`);
        return { ok: false, warnings, candidate_intervention: args.parsed.candidate_intervention };
      }
    }
  }

  return { ok: true, warnings, candidate_intervention: args.parsed.candidate_intervention };
}

export async function writeIntervention(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: InterventionParsed;
}): Promise<WriteResult> {
  const warnings: string[] = [];
  const sb = createSupabaseAdmin();

  if (args.parsed.direction === 'stop') {
    const { data: candidates } = await sb
      .from('interventions')
      .select('id, name')
      .eq('user_id', args.userId)
      .eq('status', 'active')
      .ilike('name', `%${args.parsed.name.split(' ')[0]}%`)
      .limit(1);
    if (candidates && candidates[0]) {
      await sb
        .from('interventions')
        .update({ status: 'completed', ended_at: args.occurredAt })
        .eq('id', candidates[0].id);
      return { ok: true, warnings };
    }
  }

  const { error } = await sb
    .from('interventions')
    .insert({
      user_id: args.userId,
      entry_id: args.entryId,
      name: args.parsed.name,
      type: args.parsed.type,
      direction: args.parsed.direction,
      started_at: args.occurredAt,
      expected_window_days: args.parsed.expected_window_days,
      notes: args.parsed.notes,
      status: args.parsed.direction === 'stop' ? 'completed' : 'active',
    });
  if (error) {
    warnings.push(`interventions insert failed: ${error.message}`);
    return { ok: false, warnings };
  }

  // For supplement-type starts/changes, also reflect into the persistent
  // stack so "took my day stack" picks it up next time. Best-effort: a
  // failure here doesn't undo the intervention write.
  if (
    args.parsed.type === 'supplement' &&
    (args.parsed.direction === 'start' || args.parsed.direction === 'change')
  ) {
    const { name, dose, timing, stack_group } = splitSupplementName(args.parsed.name);
    const upsertWarning = await upsertSupplement(sb, args.userId, {
      name,
      dose,
      timing,
      stack_group,
    });
    if (upsertWarning) warnings.push(upsertWarning);
  }

  return { ok: true, warnings };
}

// Pull dose / timing out of the free-form intervention name when present
// (the intervention prompt packs name+dose+timing into one string).
// "Vitamin E 400 IU morning" -> { name: "Vitamin E", dose: "400 IU", timing: "morning" }
function splitSupplementName(raw: string): {
  name: string;
  dose: string | null;
  timing: string | null;
  stack_group: string | null;
} {
  const timingMap: Record<string, { timing: string; group: string }> = {
    morning: { timing: 'morning', group: 'morning_stack' },
    breakfast: { timing: 'morning', group: 'morning_stack' },
    lunch: { timing: 'lunch', group: 'day_stack' },
    midday: { timing: 'lunch', group: 'day_stack' },
    evening: { timing: 'evening', group: 'day_stack' },
    dinner: { timing: 'evening', group: 'day_stack' },
    night: { timing: 'night', group: 'sleep_stack' },
    bed: { timing: 'night', group: 'sleep_stack' },
  };
  let timing: string | null = null;
  let group: string | null = null;
  let working = raw;
  for (const [kw, val] of Object.entries(timingMap)) {
    const re = new RegExp(`\\b(with\\s+|before\\s+|at\\s+)?${kw}\\b`, 'i');
    if (re.test(working)) {
      timing = val.timing;
      group = val.group;
      working = working.replace(re, '').trim();
      break;
    }
  }
  // Pull off a trailing dose chunk: "500mg", "5 g", "400 IU", "2.5g".
  const doseRe = /(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ug|iu|ml|tbsp|tsp))\b/i;
  const doseMatch = working.match(doseRe);
  const dose = doseMatch ? doseMatch[1].replace(/\s+/g, ' ').trim() : null;
  if (doseMatch) working = working.replace(doseRe, '').trim();
  const name = working.replace(/\s+/g, ' ').replace(/[,;]+$/, '').trim() || raw;
  return { name, dose, timing, stack_group: group };
}

async function upsertSupplement(
  sb: Admin,
  userId: string,
  item: { name: string; dose: string | null; timing: string | null; stack_group: string | null },
): Promise<string | null> {
  // Exact match first to avoid ilike-partials wrongly hitting "Vitamin D3 + K2"
  // when the user said "Vitamin D3". Fall back to ilike only if no exact match.
  let existing: Array<{ id: string; dose: string | null; timing: string | null; stack_group: string | null }> | null = null;
  const exact = await sb
    .from('supplements')
    .select('id, dose, timing, stack_group')
    .eq('user_id', userId)
    .ilike('name', item.name.trim())
    .limit(1);
  if (exact.error) return `supplements lookup failed: ${exact.error.message}`;
  if (exact.data && exact.data.length) {
    existing = exact.data;
  } else {
    const fuzzy = await sb
      .from('supplements')
      .select('id, dose, timing, stack_group')
      .eq('user_id', userId)
      .ilike('name', `%${item.name.trim()}%`)
      .order('name', { ascending: true })
      .limit(1);
    if (fuzzy.error) return `supplements lookup failed: ${fuzzy.error.message}`;
    existing = fuzzy.data ?? null;
  }

  if (existing && existing[0]) {
    const patch: Record<string, string> = {};
    if (item.dose && !existing[0].dose) patch.dose = item.dose;
    if (item.timing && !existing[0].timing) patch.timing = item.timing;
    if (item.stack_group && !existing[0].stack_group) patch.stack_group = item.stack_group;
    if (Object.keys(patch).length === 0) return null;
    const { error: updErr } = await sb.from('supplements').update(patch).eq('id', existing[0].id);
    if (updErr) return `supplements update failed: ${updErr.message}`;
    return null;
  }

  const { error: insErr } = await sb.from('supplements').insert({
    user_id: userId,
    name: item.name,
    dose: item.dose,
    timing: item.timing,
    stack_group: item.stack_group,
    is_stack: true,
    active: true,
  });
  if (insErr) return `supplements insert failed: ${insErr.message}`;
  return null;
}

// Daily targets / ceilings + bodyweight, set by voice.
//
// Each item is one of:
//   { kind: 'floor',       metric: 'protein_g',   value: 170 }  // hard floor
//   { kind: 'ceiling',     metric: 'sugar_g',     value: 30  }  // ceiling
//   { kind: 'per_lb',      metric: 'protein_g',   value: 1   }  // resolved per-bodyweight at read time
//   { kind: 'body_weight', metric: 'body_weight_lb', value: 175 }
//
// Floors are stored under their bare metric key (e.g. targets.protein_g).
// Ceilings flip to *_ceiling (e.g. targets.sugar_g_ceiling) to match
// lib/targets.ts. Per-lb ratios are stored under *_per_lb. Body weight
// updates a top-level users column. Value 0 on a floor / ceiling / per_lb
// signals removal — we delete that key from the JSON blob.
const TARGETABLE = new Set([
  'protein_g',
  'calories_kcal',
  'carbs_g',
  'fiber_g',
  'sugar_g',
  'water_ml',
  'workouts_per_week',
]);

export async function writeTargets(args: {
  userId: string;
  parsed: TargetParsed;
}): Promise<{ ok: boolean; warnings: string[]; applied: number; keys: string[] }> {
  const sb = createSupabaseAdmin();
  const warnings: string[] = [];
  const keys: string[] = [];

  // Read current row so we can merge into the existing targets JSONB
  // (Postgres jsonb_set with paths is more work than a read-modify-write
  // for the cardinality we have here).
  const { data: row, error: readErr } = await sb
    .from('users')
    .select('targets, body_weight_lb')
    .eq('id', args.userId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, warnings: [`users read: ${readErr.message}`], applied: 0, keys: [] };
  }
  const nextTargets: Record<string, number> = { ...((row?.targets ?? {}) as Record<string, number>) };
  let nextBodyWeight: number | null = (row?.body_weight_lb as number | null) ?? null;
  let applied = 0;

  for (const item of args.parsed.items ?? []) {
    const v = Number(item.value);
    if (!Number.isFinite(v)) {
      warnings.push(`skipped ${item.kind}/${item.metric}: non-numeric value`);
      continue;
    }

    if (item.kind === 'body_weight') {
      if (v <= 0) {
        warnings.push('skipped body_weight: must be > 0');
        continue;
      }
      nextBodyWeight = round(v, 1);
      keys.push('body_weight_lb');
      applied += 1;
      continue;
    }

    if (!TARGETABLE.has(item.metric)) {
      warnings.push(`skipped: metric "${item.metric}" not targetable`);
      continue;
    }

    let key: string;
    if (item.kind === 'floor') key = item.metric;
    else if (item.kind === 'ceiling') key = `${item.metric}_ceiling`;
    else if (item.kind === 'per_lb') key = `${item.metric}_per_lb`;
    else {
      warnings.push(`skipped: unknown kind "${item.kind}"`);
      continue;
    }

    if (v === 0) {
      // Removal sentinel — strip the key.
      delete nextTargets[key];
    } else {
      nextTargets[key] = v;
    }
    keys.push(key);
    applied += 1;
  }

  if (applied === 0) {
    return { ok: true, warnings, applied, keys };
  }

  const update: Record<string, unknown> = { targets: nextTargets };
  if (nextBodyWeight != null) update.body_weight_lb = nextBodyWeight;

  const { error: writeErr } = await sb.from('users').update(update).eq('id', args.userId);
  if (writeErr) {
    return {
      ok: false,
      warnings: [...warnings, `users update: ${writeErr.message}`],
      applied,
      keys,
    };
  }
  return { ok: warnings.length === 0, warnings, applied, keys };
}

function round(n: number, places: number): number {
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

export async function writePreferences(args: {
  userId: string;
  parsed: PreferenceParsed;
  source?: 'voice' | 'manual';
}): Promise<{ ok: boolean; warnings: string[]; upserted: number; keys: string[] }> {
  const sb = createSupabaseAdmin();
  const warnings: string[] = [];
  const keys: string[] = [];
  let upserted = 0;
  const source = args.source ?? 'voice';

  for (const item of args.parsed.items ?? []) {
    const key = (item.key ?? '').trim();
    if (!key) {
      warnings.push('skipped item: missing key');
      continue;
    }
    const { error } = await sb
      .from('user_preferences')
      .upsert(
        {
          user_id: args.userId,
          key,
          value_num: item.value_num,
          value_text: item.value_text,
          unit: item.unit,
          notes: item.notes,
          source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,key' },
      );
    if (error) warnings.push(`upsert "${key}": ${error.message}`);
    else {
      upserted += 1;
      keys.push(key);
    }
  }

  return { ok: warnings.length === 0, warnings, upserted, keys };
}
