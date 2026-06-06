'use client';

import { useEffect, useState } from 'react';

interface StatusResponse {
  subscriptions: number;
  devices: Array<{ host: string; created_at: string; last_used_at: string | null }>;
  vapid_configured: boolean;
  cron_secret_set: boolean;
  crons: Array<{ path: string; schedule: string; note: string }>;
}

// Push + cron diagnostic panel for /settings. Tells you which of the
// three suspects is broken when notifications stop arriving:
//   1. No push subscription on this device → "Subscriptions: 0"
//   2. VAPID env not set on the server     → vapid_configured = false
//   3. Cron isn't firing                   → manual fire works but no
//                                            scheduled push lands
//
// The three Send buttons exercise the actual push pipeline so you can
// triage which of those it is in seconds.
export function NotificationsPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'test' | 'morning' | 'evening'>(null);
  const [result, setResult] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch('/api/push/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      setStatus((await r.json()) as StatusResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status check failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function fire(kind: 'test' | 'morning' | 'evening') {
    setBusy(kind);
    setResult(null);
    try {
      let r: Response;
      if (kind === 'test') {
        r = await fetch('/api/push/test', { method: 'POST' });
      } else {
        r = await fetch('/api/notifications/self-fire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind }),
        });
      }
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? `Send failed: ${r.status}`);
      setResult(
        kind === 'test'
          ? `Test push sent to ${body?.attempted ?? '?'} device(s). Check your home screen.`
          : `${kind} prompt sent. Should land within ~10s.`,
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-h3 mb-3">Notifications</h2>

      {loading && <p className="text-small text-ink-2">Checking…</p>}
      {error && <p className="text-small text-signal-red">{error}</p>}

      {status && (
        <div className="space-y-3">
          <div className="rounded-xl bg-surface border border-line p-4 space-y-2">
            <StatusLine
              label="This device subscribed"
              ok={status.subscriptions > 0}
              detail={
                status.subscriptions === 0
                  ? 'None. Go to Today → "Get notified Friday nights" to subscribe.'
                  : `${status.subscriptions} device${status.subscriptions === 1 ? '' : 's'}`
              }
            />
            <StatusLine
              label="VAPID keys configured (server)"
              ok={status.vapid_configured}
              detail={
                status.vapid_configured
                  ? 'OK'
                  : 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing in Vercel env. Push will 503.'
              }
            />
            <StatusLine
              label="CRON_SECRET set (server)"
              ok={status.cron_secret_set}
              detail={
                status.cron_secret_set
                  ? 'OK'
                  : 'CRON_SECRET missing. Vercel cron will 401 every run.'
              }
            />
          </div>

          {status.devices.length > 0 && (
            <ul className="text-micro font-mono text-ink-3 space-y-0.5 pl-2">
              {status.devices.map((d, i) => (
                <li key={i}>
                  · {d.host} · added {short(d.created_at)}
                  {d.last_used_at && ` · last fired ${short(d.last_used_at)}`}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => fire('test')}
              disabled={busy != null || status.subscriptions === 0}
              className="h-9 px-3 rounded-xl border border-line text-small disabled:opacity-50"
            >
              {busy === 'test' ? 'Sending…' : 'Send test push'}
            </button>
            <button
              onClick={() => fire('morning')}
              disabled={busy != null || status.subscriptions === 0}
              className="h-9 px-3 rounded-xl border border-line text-small disabled:opacity-50"
            >
              {busy === 'morning' ? 'Sending…' : 'Fire morning prompt'}
            </button>
            <button
              onClick={() => fire('evening')}
              disabled={busy != null || status.subscriptions === 0}
              className="h-9 px-3 rounded-xl border border-line text-small disabled:opacity-50"
            >
              {busy === 'evening' ? 'Sending…' : 'Fire evening prompt'}
            </button>
          </div>

          {result && <p className="text-small text-ink-2">{result}</p>}

          <div className="text-micro font-mono text-ink-3 pt-2">
            Scheduled (UTC):
            <ul className="space-y-0.5 mt-1">
              {status.crons.map((c) => (
                <li key={c.path}>
                  · {c.schedule} · {c.path} · {c.note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusLine({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-small text-ink">
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${ok ? 'bg-signal-green' : 'bg-signal-red'}`} />
        {label}
      </span>
      <span className="text-micro font-mono text-ink-2 text-right">{detail}</span>
    </div>
  );
}

function short(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
  } catch {
    return iso.slice(0, 10);
  }
}
