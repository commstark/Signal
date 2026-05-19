import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('user_preferences')
    .select('id, key, value_num, value_text, unit, notes, source, updated_at')
    .eq('user_id', user.id)
    .order('key', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
