import { NextResponse } from 'next/server';
import { vapidPublicKey } from '@/lib/push';

export const runtime = 'nodejs';

// Public key only — safe to expose. The browser needs it to create the
// PushSubscription before posting to /api/push/subscribe.
export async function GET() {
  const key = vapidPublicKey();
  if (!key) return NextResponse.json({ error: 'push not configured' }, { status: 503 });
  return NextResponse.json({ key });
}
