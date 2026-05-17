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
  type WriteResult,
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
  occurred_at?: string;
  re_parse_entry_id?: string;
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
  let intent: Awaited<ReturnType<typeof classifyIntent>>['intent'];
  let intentUsage: ParseUsage;
  try {
    const res = await classifyIntent(transcript);
    intent = res.intent;
    intentUsage = res.usage;
  } catch (err) {
    console.error('intent classify failed', err);
    return NextResponse.json(
      { error: `intent classify: ${errorMessage(err)}` },
      { status: 500 },
    );
  }

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

  // 2. Upsert the entry row.
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
        parse_status: 'pending',
        parse_warnings: [],
        extracted_facts: null,
      })
      .eq('id', entryId)
      .eq('user_id', user.id);
    if (upErr) {
      return NextResponse.json(
        { error: `entries update: ${upErr.message}`, entry_id: entryId },
        { status: 500 },
      );
    }
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
        parse_status: 'pending',
      })
      .select('id')
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: `entries insert: ${error?.message ?? 'unknown'}` },
        { status: 500 },
      );
    }
    entryId = data.id as string;
  }

  // 3. Run the per-intent parsers and writers. Never 500 here — collect
  //    warnings and persist them on the entry so the UI can show partial
  //    state. extracted_facts captures everything the LLM returned, even
  //    when canonical inserts fail.
  const extractedFacts: Record<string, unknown> = {};
  const warnings: string[] = [];
  const sectionResults: Array<{ section: string; result: WriteResult }> = [];

  if (intent === 'health_log' || intent === 'mixed' || intent === 'free_note') {
    try {
      const { value, usage } = await parseHealthLog(transcript, occurredAt);
      usageTotals.push(usage);
      extractedFacts.health = value;
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
      const result = await writeHealthLog({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as HealthLogParsed,
      });
      sectionResults.push({ section: 'health', result });
      warnings.push(...result.warnings);
    } catch (err) {
      console.error('health parse error', err);
      warnings.push(`health parse failed: ${errorMessage(err)}`);
    }
  }

  if (intent === 'workout_log' || intent === 'mixed') {
    try {
      const { value, usage } = await parseWorkoutLog(transcript, occurredAt);
      usageTotals.push(usage);
      extractedFacts.workout = value;
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
      const result = await writeWorkoutLog({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as WorkoutLogParsed,
      });
      sectionResults.push({ section: 'workout', result });
      warnings.push(...result.warnings);
    } catch (err) {
      console.error('workout parse error', err);
      warnings.push(`workout parse failed: ${errorMessage(err)}`);
    }
  }

  if (intent === 'supplement_log' || intent === 'mixed') {
    try {
      const { data: stack } = await admin
        .from('supplements')
        .select('id, name, dose, timing, stack_group')
        .eq('user_id', user.id)
        .eq('active', true);
      const { value, usage } = await parseSupplementLog(transcript, stack ?? []);
      usageTotals.push(usage);
      extractedFacts.supplement = value;
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
      const result = await writeSupplementLog({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as SupplementLogParsed,
      });
      sectionResults.push({ section: 'supplement', result });
      warnings.push(...result.warnings);
    } catch (err) {
      console.error('supplement parse error', err);
      warnings.push(`supplement parse failed: ${errorMessage(err)}`);
    }
  }

  if (intent === 'intervention_start' || intent === 'intervention_stop') {
    try {
      const dir: 'start' | 'stop' = intent === 'intervention_start' ? 'start' : 'stop';
      const { value, usage } = await parseIntervention(transcript, dir);
      usageTotals.push(usage);
      extractedFacts.intervention = value;
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
      const result = await writeIntervention({
        userId: user.id,
        entryId,
        occurredAt,
        parsed: value as InterventionParsed,
      });
      sectionResults.push({ section: 'intervention', result });
      warnings.push(...result.warnings);
    } catch (err) {
      console.error('intervention parse error', err);
      warnings.push(`intervention parse failed: ${errorMessage(err)}`);
    }
  }

  // 4. Decide the entry's final parse status.
  let parseStatus: 'ok' | 'partial' | 'failed';
  if (sectionResults.length === 0) {
    parseStatus = warnings.length === 0 ? 'ok' : 'failed';
  } else if (sectionResults.every((s) => s.result.ok) && warnings.length === 0) {
    parseStatus = 'ok';
  } else if (sectionResults.some((s) => s.result.ok)) {
    parseStatus = 'partial';
  } else {
    parseStatus = 'failed';
  }

  const totalCost = usageTotals.reduce((acc, u) => acc + u.costUsd, 0);
  await admin
    .from('entries')
    .update({
      parse_cost_usd: totalCost,
      extracted_facts: extractedFacts,
      parse_warnings: warnings,
      parse_status: parseStatus,
    })
    .eq('id', entryId);

  return NextResponse.json({
    entry_id: entryId,
    intent,
    parse_status: parseStatus,
    warnings,
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts = [
      typeof e.message === 'string' ? e.message : null,
      typeof e.details === 'string' ? e.details : null,
      typeof e.hint === 'string' ? `hint: ${e.hint}` : null,
      typeof e.code === 'string' ? `[${e.code}]` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  return 'unknown error';
}

async function clearStructuredForEntry(
  admin: ReturnType<typeof createSupabaseAdmin>,
  entryId: string,
) {
  // Cascading deletes on health_logs handle food_log_items.
  await admin.from('health_logs').delete().eq('entry_id', entryId);
  await admin.from('supplement_logs').delete().eq('entry_id', entryId);
  // Workout exercises sets cascade; sessions are kept (they may host other entries).
  await admin.from('workout_exercises').delete().eq('entry_id', entryId);
}
