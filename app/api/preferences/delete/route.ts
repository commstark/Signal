import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json().catch(() => null)) as { key?: string } | null;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from('user_preferences')
    .delete()
    .eq('user_id', user.id)
    .eq('key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
