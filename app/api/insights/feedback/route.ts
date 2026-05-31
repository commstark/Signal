import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface Body {
  insight_id: string;
  verdict: 'up' | 'down' | 'wrong';
  note?: string;
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
  if (!body.insight_id || !['up', 'down', 'wrong'].includes(body.verdict)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  const { error } = await sb.from('insight_feedback').upsert(
    {
      insight_id: body.insight_id,
      user_id: user.id,
      verdict: body.verdict,
      note: body.note ?? null,
    },
    { onConflict: 'insight_id,user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
