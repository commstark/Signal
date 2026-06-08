// Shared cron auth check. Separates "server isn't configured" from
// "request didn't carry the right secret" so the diagnostic surface in
// Vercel's invocation log tells you which one is wrong.
//
// Returns null on success; returns a Response on failure so the caller
// can early-return it.
import { NextRequest, NextResponse } from 'next/server';

export function requireCronAuth(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      {
        error: 'server_misconfigured',
        detail:
          'CRON_SECRET is not set on the server. Add it in Vercel env (Settings -> Environment Variables) and redeploy.',
      },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        detail:
          'Authorization header missing or did not match CRON_SECRET. Vercel sends "Bearer <CRON_SECRET>" automatically for cron paths declared in vercel.json — if this 401 is from a scheduled run, the secret in env disagrees with what the route checks.',
        received_auth_header_present: !!auth,
      },
      { status: 401 },
    );
  }
  return null;
}
