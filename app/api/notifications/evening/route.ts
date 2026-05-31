import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { sendEveningPrompt } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('push_subscriptions').select('user_id');
  const userIds = Array.from(new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)));
  await Promise.allSettled(userIds.map((uid) => sendEveningPrompt(uid)));
  return NextResponse.json({ ok: true, users: userIds.length });
}
