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

  const body = (await req.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim();
  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('open_questions')
    .insert({ user_id: user.id, question })
    .select('id, asked_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id, asked_at: data.asked_at });
}
