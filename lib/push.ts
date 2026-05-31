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

// Fire a push to every device the user has registered. Cleans up
// 404/410 endpoints (browser uninstalled / permission revoked).
export async function sendInsightPush(userId: string, insightCount: number): Promise<void> {
  if (insightCount === 0) return;
  configure();
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId);
  const subs = (data ?? []) as PushSubscriptionRow[];
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: insightCount === 1 ? 'New insight ready' : `${insightCount} new insights ready`,
    body: 'Tap to see what your last week looked like.',
    url: '/today',
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
          },
          payload,
        );
        await sb
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        // Browser unsubscribed or endpoint expired — drop the row.
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('web-push send error', e);
        }
      }
    }),
  );
}
