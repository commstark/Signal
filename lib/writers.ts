import { createSupabaseAdmin } from './supabase/admin';
import type {
  HealthLogParsed,
  WorkoutLogParsed,
  SupplementLogParsed,
  InterventionParsed,
} from './types';

type Admin = ReturnType<typeof createSupabaseAdmin>;

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
}) {
  const sb = createSupabaseAdmin();
  const interventionId = await findActiveInterventionId(sb, args.userId, args.occurredAt);
  const n = args.parsed.estimated_nutrition;
  const { data: hl, error } = await sb
    .from('health_logs')
    .insert({
      entry_id: args.entryId,
      user_id: args.userId,
      occurred_at: args.occurredAt,
      intervention_id: interventionId,
      protein_g: n.protein_g,
      calories_kcal: n.calories_kcal,
      fiber_g: n.fiber_g,
      added_sugars_g: n.added_sugars_g,
      saturated_fat_present: n.saturated_fat_present,
      carb_timing: n.carb_timing,
      ultra_processed: n.ultra_processed,
      nutrition_confidence: n.confidence,
      mood_score: args.parsed.mood?.score ?? null,
      mood_descriptor: args.parsed.mood?.descriptor ?? null,
      energy_score: args.parsed.energy?.score ?? null,
      energy_descriptor: args.parsed.energy?.descriptor ?? null,
      concentration_score: args.parsed.concentration?.score ?? null,
      fullness: args.parsed.fullness,
      symptoms: args.parsed.symptoms ?? [],
      water_oz: args.parsed.water_oz,
      free_text_notes: args.parsed.free_text_notes,
    })
    .select('id')
    .single();
  if (error) throw error;

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
    if (e) throw e;
  }

  return hl.id as string;
}

export async function writeWorkoutLog(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: WorkoutLogParsed;
}) {
  const sb = createSupabaseAdmin();
  const interventionId = await findActiveInterventionId(sb, args.userId, args.occurredAt);

  // Find or create a session for "today" (90-min grouping window).
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
    if (error) throw error;
    sessionId = created.id;
  }

  for (const ex of args.parsed.exercises) {
    const { data: created, error } = await sb
      .from('workout_exercises')
      .insert({
        session_id: sessionId,
        entry_id: args.entryId,
        user_id: args.userId,
        intervention_id: interventionId,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        occurred_at: args.occurredAt,
      })
      .select('id')
      .single();
    if (error) throw error;

    if (ex.sets?.length) {
      const sets = ex.sets.map((s, i) => ({
        exercise_id: created.id,
        set_number: i + 1,
        weight_lb: s.weight_lb,
        reps: s.reps,
        rpe: s.rpe,
        notes: s.notes,
      }));
      const { error: e2 } = await sb.from('workout_sets').insert(sets);
      if (e2) throw e2;
    }
  }

  return sessionId;
}

export async function writeSupplementLog(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: SupplementLogParsed;
}) {
  const sb = createSupabaseAdmin();
  const interventionId = await findActiveInterventionId(sb, args.userId, args.occurredAt);

  if (args.parsed.logs?.length) {
    const rows = args.parsed.logs.map((l) => ({
      user_id: args.userId,
      entry_id: args.entryId,
      supplement_id: l.supplement_id,
      intervention_id: interventionId,
      supplement_name: l.supplement_name,
      occurred_at: args.occurredAt,
      taken: l.taken,
      notes: l.notes,
    }));
    const { error } = await sb.from('supplement_logs').insert(rows);
    if (error) throw error;
  }

  // Candidate intervention surfaces in the dashboard for confirmation.
  return { candidate_intervention: args.parsed.candidate_intervention };
}

export async function writeIntervention(args: {
  userId: string;
  entryId: string;
  occurredAt: string;
  parsed: InterventionParsed;
}) {
  const sb = createSupabaseAdmin();

  if (args.parsed.direction === 'stop') {
    // Try to end the most recent active intervention with a matching name.
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
      return candidates[0].id as string;
    }
  }

  const { data, error } = await sb
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
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
