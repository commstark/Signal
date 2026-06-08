import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { sendMorningPrompt } from '@/lib/push';
import { requireCronAuth } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const started = Date.now();
  const sb = createSupabaseAdmin();
  // Anyone with a push subscription gets the 8am check-in.
  const { data, error } = await sb.from('push_subscriptions').select('user_id');
  if (error) {
    console.error('morning cron: push_subscriptions read failed', error);
    return NextResponse.json(
      { error: 'subscriptions_read_failed', detail: error.message },
      { status: 500 },
    );
  }
  const userIds = Array.from(
    new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
  );

  const perUser = await Promise.all(
    userIds.map(async (uid) => {
      try {
        const result = await sendMorningPrompt(uid);
        return { user_id: uid, ok: true, ...result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        return {
          user_id: uid,
          ok: false,
          attempted: 0,
          succeeded: 0,
          removed_dead: 0,
          errors: [msg],
        };
      }
    }),
  );

  const totals = perUser.reduce(
    (acc, r) => ({
      attempted: acc.attempted + (r.attempted ?? 0),
      succeeded: acc.succeeded + (r.succeeded ?? 0),
      removed_dead: acc.removed_dead + (r.removed_dead ?? 0),
      failed_users: acc.failed_users + (r.ok ? 0 : 1),
    }),
    { attempted: 0, succeeded: 0, removed_dead: 0, failed_users: 0 },
  );

  console.log(
    `morning cron complete: users=${userIds.length} attempted=${totals.attempted} succeeded=${totals.succeeded} removed_dead=${totals.removed_dead} failed_users=${totals.failed_users} duration_ms=${Date.now() - started}`,
  );

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    ...totals,
    duration_ms: Date.now() - started,
    per_user: perUser,
  });
}
