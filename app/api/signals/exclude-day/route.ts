import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface Body {
  date: string; // YYYY-MM-DD
  excluded: boolean;
  reason?: string;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) {
    return NextResponse.json({ error: 'invalid date (YYYY-MM-DD required)' }, { status: 400 });
  }
  const sb = createSupabaseAdmin();
  if (body.excluded === false) {
    // Restore: drop the row entirely so the day flows back into stats.
    const { error } = await sb
      .from('daily_overrides')
      .delete()
      .eq('user_id', user.id)
      .eq('date', body.date);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, restored: true });
  }
  const { error } = await sb.from('daily_overrides').upsert(
    {
      user_id: user.id,
      date: body.date,
      excluded: true,
      reason: (body.reason ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,date' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, excluded: true });
}
