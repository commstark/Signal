import webpush from 'web-push';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:hello@signal.app';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY).');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? '';
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

interface Payload {
  title: string;
  body: string;
  url: string;
}

export interface DeliverResult {
  attempted: number;
  succeeded: number;
  removed_dead: number;
  errors: string[];
}

// Lower-level fan-out shared by all push types. Cleans up 404/410, and
// returns a detailed result so cron routes can echo exactly what
// happened back to Vercel's invocation log.
async function deliver(userId: string, payload: Payload): Promise<DeliverResult> {
  configure();
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId);
  const subs = (data ?? []) as PushSubscriptionRow[];
  const result: DeliverResult = {
    attempted: subs.length,
    succeeded: 0,
    removed_dead: 0,
    errors: [],
  };
  if (subs.length === 0) return result;
  const serialized = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          serialized,
        );
        await sb
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);
        result.succeeded += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        const msg = e instanceof Error ? e.message : String(e);
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id);
          result.removed_dead += 1;
        } else {
          result.errors.push(`status=${status ?? '?'} msg=${msg.slice(0, 200)}`);
          console.error('web-push send error', { status, msg });
        }
      }
    }),
  );
  return result;
}

// Morning check-in: 8am local. Drops the user on /today right at the
// sleep tile so a single tap (horrible/bad/ok/good/great) logs it. The
// hash deep-link lets the tile auto-scroll into view.
export async function sendMorningPrompt(userId: string): Promise<DeliverResult> {
  return deliver(userId, {
    title: 'How did you sleep?',
    body: 'Tap to log: horrible · bad · ok · good · great.',
    url: '/today#sleep',
  });
}

// Evening check-in: 9pm local. Drops the user on /today#energy so one tap
// logs how they felt today (Drained → High). Sleep still accessible above it.
export async function sendEveningPrompt(userId: string): Promise<DeliverResult> {
  return deliver(userId, {
    title: 'Quick check-in',
    body: "How's your energy today? Tap to log.",
    url: '/today#energy',
  });
}

// Test push for manual diagnostics — sends to every registered device.
export async function sendTestPush(userId: string): Promise<DeliverResult> {
  return deliver(userId, {
    title: 'Signal test',
    body: 'If you see this, push notifications are working.',
    url: '/today',
  });
}

// Fan-out for the Friday weekly insights cron. Always fires so the user
// knows the pipeline ran — zero-insight weeks get a "keep logging" nudge.
export async function sendInsightPush(
  userId: string,
  insightCount: number,
): Promise<DeliverResult> {
  const title =
    insightCount > 0
      ? insightCount === 1
        ? 'New insight ready'
        : `${insightCount} new insights ready`
      : 'Weekly reflection complete';
  const body =
    insightCount > 0
      ? 'Tap to see what your last week looked like.'
      : 'Keep logging this week to unlock patterns.';
  return deliver(userId, { title, body, url: '/today' });
}
