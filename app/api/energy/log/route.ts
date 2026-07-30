import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Tap-to-log energy from /today. Writes a normal entry + health_log row so
// the audit trail is identical to a voice note. Latest row wins on /today,
// so re-tapping to correct just stacks a new row and the UI re-reads.
//
// POST body: { score: 2|4|6|8|10 }
// The 5-step pill maps: Drained=2, Low=4, OK=6, Good=8, High=10
// (1-10 column keeps voice-logging compatible at any value in that range)

const SCORE_TO_LABEL: Record<number, string> = {
  2: 'drained',
  4: 'low',
  6: 'ok',
  8: 'good',
  10: 'high',
};

const VALID_SCORES = new Set([2, 4, 6, 8, 10]);

interface Body {
  score: number;
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
  if (!VALID_SCORES.has(score)) {
    return NextResponse.json(
      { error: 'score must be 2, 4, 6, 8, or 10 (Drained/Low/OK/Good/High)' },
      { status: 400 },
    );
  }
  const label = SCORE_TO_LABEL[score];
  const occurredAt = new Date().toISOString();

  const sb = createSupabaseAdmin();
  const { data: entry, error: eErr } = await sb
    .from('entries')
    .insert({
      user_id: user.id,
      occurred_at: occurredAt,
      transcript: `Energy: ${label}.`,
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
    energy_score: score,
    energy_descriptor: label,
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
    energy_score: score,
    energy_label: label,
  });
}
