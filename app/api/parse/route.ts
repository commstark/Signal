import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  classifyIntent,
  parseHealthLog,
  parseWorkoutLog,
  parseSupplementLog,
  parseIntervention,
  type ParseUsage,
} from '@/lib/parse';
import { recordUsage } from '@/lib/usage';
import {
  writeHealthLog,
  writeWorkoutLog,
  writeSupplementLog,
  writeIntervention,
} from '@/lib/writers';
import type {
  HealthLogParsed,
  WorkoutLogParsed,
  SupplementLogParsed,
  InterventionParsed,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
  transcript: string;
  audio_url?: string | null;
  audio_duration_s?: number | null;
  occurred_at?: string; // ISO; defaults to now
  re_parse_entry_id?: string; // when re-parsing after a transcript edit
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body: Body = await req.json();
  if (!body.transcript?.trim()) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 });
  }
  const occurredAt = body.occurred_at ?? new Date().toISOString();
  const transcript = body.transcript.trim();

  // 1. Classify intent (Haiku).
  const { intent, usage: intentUsage } = await classifyIntent(transcript);
  await recordUsage({
    userId: user.id,
    service: 'anthropic',
    model: intentUsage.model,
    endpoint: 'intent',
    inputTokens: intentUsage.inputTokens,
    outputTokens: intentUsage.outputTokens,
    costUsd: intentUsage.costUsd,
  });
  const usageTotals: ParseUsage[] = [intentUsage];

  // 2. Upsert the entry row. If re-parsing, replace prior structured data.
  const admin = createSupabaseAdmin();
  let entryId: string;
  if (body.re_parse_entry_id) {
    entryId = body.re_parse_entry_id;
    const { error: upErr } = await admin
      .from('entries')
      .update({
        transcript,
        intent,
        transcript_edited: true,
        parse_model: intentUsage.model,
      })
      .eq('id', entryId)
      .eq('user_id', user.id);
    if (upErr) {
      return NextResponse.json(
        { error: `entries update: ${upErr.message}`, entry_id: entryId },
        { status: 500 },
      );
    }

    // Clear structured rows for this entry so the re-parse writes fresh data.
    await clearStructuredForEntry(admin, entryId);
  } else {
    const { data, error } = await admin
      .from('entries')
      .insert({
        user_id: user.id,
        occurred_at: occurredAt,
        audio_url: body.audio_url ?? null,
        audio_duration_s: body.audio_duration_s ?? null,
        transcript,
        intent,
        parse_model: intentUsage.model,
        parse_cost_usd: intentUsage.costUsd,
      })
      .select('id')
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    entryId = data.id as string;
  }

  // 3. Route to the per-intent parser and writer.
  try {
    if (intent === 'health_log' || intent === 'mixed' || intent === 'free_note') {
      // We always attempt health_log extraction on health/mixed/free_note —
      // a "free_note" might still mention how Jon felt.
      const { value, usage } = await parseHealthLog(transcript, occurredAt);
      usageTotals.push(usage);
      await recordUsage({
        userId: user.id,
        service: 'anthropic',
        model: usage.model,
        endpoint: 'parse-health',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        entryId,
      });
      await writeHealthLog({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as HealthLogParsed,
      });
    }

    if (intent === 'workout_log' || intent === 'mixed') {
      const { value, usage } = await parseWorkoutLog(transcript, occurredAt);
      usageTotals.push(usage);
      await recordUsage({
        userId: user.id,
        service: 'anthropic',
        model: usage.model,
        endpoint: 'parse-workout',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        entryId,
      });
      await writeWorkoutLog({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as WorkoutLogParsed,
      });
    }

    if (intent === 'supplement_log' || intent === 'mixed') {
      const { data: stack } = await admin
        .from('supplements')
        .select('id, name, dose, timing, stack_group')
        .eq('user_id', user.id)
        .eq('active', true);
      const { value, usage } = await parseSupplementLog(transcript, stack ?? []);
      usageTotals.push(usage);
      await recordUsage({
        userId: user.id,
        service: 'anthropic',
        model: usage.model,
        endpoint: 'parse-supplement',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        entryId,
      });
      await writeSupplementLog({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as SupplementLogParsed,
      });
    }

    if (intent === 'intervention_start' || intent === 'intervention_stop') {
      const dir: 'start' | 'stop' = intent === 'intervention_start' ? 'start' : 'stop';
      const { value, usage } = await parseIntervention(transcript, dir);
      usageTotals.push(usage);
      await recordUsage({
        userId: user.id,
        service: 'anthropic',
        model: usage.model,
        endpoint: 'parse-intervention',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        entryId,
      });
      await writeIntervention({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as InterventionParsed,
      });
    }
  } catch (err) {
    console.error('parse error', err);
    const msg = err instanceof Error ? err.message : 'parse failed';
    return NextResponse.json(
      { error: msg, entry_id: entryId, intent },
      { status: 500 },
    );
  }

  // Update entry-level parse cost summary.
  const totalCost = usageTotals.reduce((acc, u) => acc + u.costUsd, 0);
  await admin
    .from('entries')
    .update({ parse_cost_usd: totalCost })
    .eq('id', entryId);

  return NextResponse.json({ entry_id: entryId, intent });
}

async function clearStructuredForEntry(
  admin: ReturnType<typeof createSupabaseAdmin>,
  entryId: string,
) {
  // Cascading deletes on health_logs handle food_log_items.
  await admin.from('health_logs').delete().eq('entry_id', entryId);
  await admin.from('supplement_logs').delete().eq('entry_id', entryId);

  // Workout exercises sets cascade; sessions are kept (they may host other entries).
  const { data: exs } = await admin
    .from('workout_exercises')
    .select('id')
    .eq('entry_id', entryId);
  if (exs?.length) {
    await admin.from('workout_exercises').delete().eq('entry_id', entryId);
  }

  // Interventions: we don't auto-undo on re-parse. The user can delete manually.
}
