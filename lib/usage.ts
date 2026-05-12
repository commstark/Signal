import { createSupabaseAdmin } from './supabase/admin';

interface UsageRow {
  userId: string;
  service: 'whisper' | 'anthropic';
  model?: string;
  endpoint?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  costUsd: number;
  entryId?: string;
}

export async function recordUsage(row: UsageRow) {
  const sb = createSupabaseAdmin();
  await sb.from('api_usage').insert({
    user_id: row.userId,
    service: row.service,
    model: row.model ?? null,
    endpoint: row.endpoint ?? null,
    input_tokens: row.inputTokens ?? null,
    output_tokens: row.outputTokens ?? null,
    audio_seconds: row.audioSeconds ?? null,
    cost_usd: row.costUsd,
    entry_id: row.entryId ?? null,
  });
}
