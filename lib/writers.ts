import { createSupabaseAdmin } from './supabase/admin';
import type {
  HealthLogParsed,
  WorkoutLogParsed,
  SupplementLogParsed,
  InterventionParsed,
  MuscleGroup,
  ExerciseType,
} from './types';

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
      added_sugars_g: clampNumeric(n.added_sugars_g, 9999),
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

  if (!args.parsed.exercises?.length) {
    // Empty is fine — common for 'mixed' intent entries that mention
    // food/supplements but no exercise. Don't pollute parse_warnings.
    return { ok: true, warnings };
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
  return { ok: true, warnings };
}
