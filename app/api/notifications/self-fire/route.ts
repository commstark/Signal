import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { sendMorningPrompt, sendEveningPrompt } from '@/lib/push';

export const runtime = 'nodejs';

// Manually fire the same prompts the cron sends, but only at the
// logged-in user (no CRON_SECRET). Lets you verify the push pipeline
// works without waiting for tomorrow's 8am/9pm tick.
//
// POST body: { kind: 'morning' | 'evening' }
interface Body {
  kind: 'morning' | 'evening';
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
  if (body.kind !== 'morning' && body.kind !== 'evening') {
    return NextResponse.json({ error: "kind must be 'morning' or 'evening'" }, { status: 400 });
  }
  try {
    if (body.kind === 'morning') await sendMorningPrompt(user.id);
    else await sendEveningPrompt(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('self-fire failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
