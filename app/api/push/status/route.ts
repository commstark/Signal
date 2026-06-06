import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Diagnostic for the user when push isn't arriving. Tells you which
// of the three usual suspects is broken: no subscription on this
// device, VAPID env not configured server-side, or "actually fine but
// the cron itself never fired".
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const devices = (data ?? []) as Array<{
    id: string;
    endpoint: string;
    created_at: string;
    last_used_at: string | null;
  }>;
  const cronSecretSet = !!process.env.CRON_SECRET;
  const vapidConfigured =
    !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
  return NextResponse.json({
    subscriptions: devices.length,
    devices: devices.map((d) => {
      let host = '';
      try {
        host = new URL(d.endpoint).hostname;
      } catch {
        host = 'unknown';
      }
      return {
        host,
        created_at: d.created_at,
        last_used_at: d.last_used_at,
      };
    }),
    vapid_configured: vapidConfigured,
    cron_secret_set: cronSecretSet,
    // Cron schedules so the UI can show what SHOULD be firing (matches vercel.json).
    crons: [
      { path: '/api/notifications/morning', schedule: '0 16 * * *', note: '8am PST daily' },
      { path: '/api/notifications/evening', schedule: '0 5 * * *', note: '9pm PST daily' },
      { path: '/api/insights/weekly', schedule: '0 5 * * 6', note: 'Friday 9pm PST weekly' },
    ],
  });
}
