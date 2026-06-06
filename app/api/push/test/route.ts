import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { sendTestPush } from '@/lib/push';

export const runtime = 'nodejs';

// Manually fire a test push to the logged-in user's devices. Tests the
// VAPID + service worker path without waiting for the next cron tick.
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  try {
    const result = await sendTestPush(user.id);
    return NextResponse.json({ ok: true, attempted: result.attempted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('test push failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
