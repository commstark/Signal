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

// Lower-level fan-out shared by all push types. Cleans up 404/410.
async function deliver(userId: string, payload: Payload): Promise<void> {
  configure();
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId);
  const subs = (data ?? []) as PushSubscriptionRow[];
  if (subs.length === 0) return;
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
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('web-push send error', e);
        }
      }
    }),
  );
}

// Morning check-in: 8am local. Opens the record screen so the user can
// just tap and talk if they want to log how they slept / how they feel.
export async function sendMorningPrompt(userId: string): Promise<void> {
  await deliver(userId, {
    title: 'Good morning',
    body: 'How did you sleep? Anything off this morning?',
    url: '/',
  });
}

// Evening check-in: 9pm local. Mood + sleep-aware nudge.
export async function sendEveningPrompt(userId: string): Promise<void> {
  await deliver(userId, {
    title: 'Quick check-in',
    body: 'How was your mood today? Notice anything about sleep last night?',
    url: '/',
  });
}

// Fan-out for the Friday weekly insights cron.
export async function sendInsightPush(userId: string, insightCount: number): Promise<void> {
  if (insightCount === 0) return;
  await deliver(userId, {
    title: insightCount === 1 ? 'New insight ready' : `${insightCount} new insights ready`,
    body: 'Tap to see what your last week looked like.',
    url: '/today',
  });
}
