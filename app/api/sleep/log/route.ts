import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Tap-to-log sleep from /today. Writes a normal entry + health_log row so
// the audit trail is identical to a voice note. Latest row wins on /today,
// so re-tapping to correct just stacks a new row and the UI re-reads.
//
// POST body: { score: 1..5, descriptor?: string }
const LABELS: Record<number, string> = {
  1: 'horrible',
  2: 'bad',
  3: 'ok',
  4: 'good',
  5: 'great',
};

interface Body {
  score: number;
  descriptor?: string;
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json()) as Body;
  const score = Math.round(Number(body.score));
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json(
      { error: 'score must be an integer 1..5 (1=horrible, 5=great)' },
      { status: 400 },
    );
  }
  const label = LABELS[score];
  const descriptor = body.descriptor?.trim() || label;
  const occurredAt = new Date().toISOString();

  const sb = createSupabaseAdmin();
  const { data: entry, error: eErr } = await sb
    .from('entries')
    .insert({
      user_id: user.id,
      occurred_at: occurredAt,
      transcript: `Slept ${label}.`,
      intent: 'health_log',
      parse_status: 'ok',
    })
    .select('id')
    .single();
  if (eErr || !entry) {
    return NextResponse.json(
      { error: `entries insert: ${eErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const { error: hErr } = await sb.from('health_logs').insert({
    entry_id: entry.id,
    user_id: user.id,
    occurred_at: occurredAt,
    sleep_score: score,
    sleep_descriptor: descriptor,
  });
  if (hErr) {
    return NextResponse.json(
      { error: `health_logs insert: ${hErr.message}`, entry_id: entry.id },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    entry_id: entry.id,
    sleep_score: score,
    sleep_label: label,
  });
}
