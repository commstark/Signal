import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { sendMorningPrompt } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = createSupabaseAdmin();
  // Anyone with a push subscription gets the 8am check-in. Cheap enough
  // not to gate further; the deliver() helper auto-prunes dead endpoints.
  const { data } = await sb.from('push_subscriptions').select('user_id');
  const userIds = Array.from(new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)));
  await Promise.allSettled(userIds.map((uid) => sendMorningPrompt(uid)));
  return NextResponse.json({ ok: true, users: userIds.length });
}
