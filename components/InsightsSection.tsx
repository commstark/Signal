'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActiveInsight } from '@/lib/insights/load';

interface Props {
  insights: ActiveInsight[];
}

export function InsightsSection({ insights }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runInfo, setRunInfo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | 'wrong'>>({});

  async function runNow() {
    setRunning(true);
    setRunError(null);
    setRunInfo(null);
    try {
      const r = await fetch('/api/insights/run-now', { method: 'POST' });
      const body = (await r.json().catch(() => null)) as
        | { error?: string; insights_written?: number; candidates_found?: number }
        | null;
      if (!r.ok) {
        throw new Error(body?.error ?? `Run failed: ${r.status}`);
      }
      // The run endpoint returns 200 with { error } when nothing was
      // written (e.g. not enough history) — surface that to the user
      // instead of silently refreshing into the same empty state.
      if (body?.error) {
        setRunError(body.error);
      } else if ((body?.insights_written ?? 0) === 0) {
        setRunInfo(
          `Ran on ${body?.candidates_found ?? 0} candidate signal(s) — none crossed the surprise threshold this run. Try again after a few more days of logs.`,
        );
      }
      router.refresh();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Run failed.');
    } finally {
      setRunning(false);
    }
  }

  async function thumb(id: string, verdict: 'up' | 'down' | 'wrong') {
    setFeedback((f) => ({ ...f, [id]: verdict }));
    await fetch('/api/insights/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insight_id: id, verdict }),
    }).catch(() => {
      setFeedback((f) => {
        const { [id]: _, ...rest } = f;
        return rest;
      });
    });
  }

  return (
    <section className="px-4 mt-8" data-tour="insights">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-h3">Insights</h2>
        <button
          onClick={runNow}
          disabled={running}
          className="text-small text-ink-2 hover:text-ink disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>

      <PushEnableRow />

      {runError && <p className="text-small text-signal-red mb-2">{runError}</p>}
      {runInfo && !runError && <p className="text-small text-ink-2 mb-2">{runInfo}</p>}

      {insights.length === 0 ? (
        <p className="text-small text-ink-2 leading-relaxed">
          No insights yet. Run your reflection once you have a few days of logs — Friday
          nights it’ll run on its own.
        </p>
      ) : (
        <ul className="space-y-3">
          {insights.map((ins) => (
            <li key={ins.id} className="rounded-2xl bg-surface p-5 shadow-soft space-y-2">
              <p className="text-body text-ink leading-snug">{ins.headline}</p>
              {ins.why_it_matters && (
                <p className="text-small text-ink-2 leading-relaxed">{ins.why_it_matters}</p>
              )}
              {ins.caveats.length > 0 && (
                <ul className="space-y-0.5">
                  {ins.caveats.map((c, i) => (
                    <li key={i} className="text-micro text-ink-3">
                      · {c}
                    </li>
                  ))}
                </ul>
              )}
              <ShowHow insight={ins} />
              <div className="flex items-center gap-2 pt-1">
                <FeedbackButton current={feedback[ins.id]} verdict="up" onClick={() => thumb(ins.id, 'up')}>
                  Useful
                </FeedbackButton>
                <FeedbackButton current={feedback[ins.id]} verdict="down" onClick={() => thumb(ins.id, 'down')}>
                  Not useful
                </FeedbackButton>
                <FeedbackButton current={feedback[ins.id]} verdict="wrong" onClick={() => thumb(ins.id, 'wrong')}>
                  Wrong
                </FeedbackButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedbackButton({
  current,
  verdict,
  onClick,
  children,
}: {
  current: 'up' | 'down' | 'wrong' | undefined;
  verdict: 'up' | 'down' | 'wrong';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === verdict;
  return (
    <button
      onClick={onClick}
      className={`text-micro px-3 py-1 rounded-full border transition-colors ${
        active
          ? verdict === 'wrong'
            ? 'border-signal-red text-signal-red bg-signal-red/5'
            : 'border-ink text-ink bg-ink/5'
          : 'border-line text-ink-3 hover:text-ink-2'
      }`}
    >
      {children}
    </button>
  );
}

function ShowHow({ insight }: { insight: ActiveInsight }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-micro text-ink-3 hover:text-ink-2 underline underline-offset-4"
      >
        {open ? 'Hide how' : 'Show how'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-surface-2/60 px-3 py-2 space-y-1 text-micro font-mono text-ink-2 leading-relaxed tabular-nums">
          {renderMetrics(insight)}
        </div>
      )}
    </div>
  );
}

// Lightweight inline prompt to enable web-push notifications. Renders
// nothing if push is unsupported, already granted+subscribed, or denied.
// One-tap subscribe; service worker should already be registered.
function PushEnableRow() {
  const [state, setState] = useState<'unknown' | 'unsupported' | 'available' | 'subscribed' | 'denied'>(
    'unknown',
  );
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'subscribed' : 'available'))
      .catch(() => setState('available'));
  }, []);

  async function enable() {
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'available');
        return;
      }
      const keyRes = await fetch('/api/push/vapid-public-key').then((r) => r.json());
      if (!keyRes?.key) throw new Error('Push not configured on the server yet.');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast through BufferSource — modern lib.dom types narrow Uint8Array's
        // ArrayBufferLike generic in a way the PushManager signature doesn't.
        applicationServerKey: urlBase64ToUint8Array(keyRes.key) as unknown as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!r.ok) throw new Error('Subscription save failed.');
      setState('subscribed');
    } catch (e) {
      console.error('push enable failed', e);
    } finally {
      setWorking(false);
    }
  }

  if (state === 'unknown' || state === 'unsupported' || state === 'subscribed') return null;
  if (state === 'denied') {
    return (
      <p className="text-micro text-ink-3 mb-3">
        Notifications denied in browser settings — enable there to get Friday reflections.
      </p>
    );
  }
  return (
    <button
      onClick={enable}
      disabled={working}
      className="text-micro text-ink-2 hover:text-ink underline underline-offset-4 mb-3 disabled:opacity-50"
    >
      {working ? 'Enabling…' : 'Get notified Friday nights when this lands →'}
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function renderMetrics(insight: ActiveInsight): React.ReactNode {
  const m = insight.metrics;
  switch (m.kind) {
    case 'correlation':
      return (
        <>
          <div>{m.metric_a} ↔ {m.metric_b} (lag {m.lag_days}d)</div>
          <div>Pearson r = {m.pearson_r} · n = {m.n}</div>
          <div>Window: {m.window.start} → {m.window.end}</div>
        </>
      );
    case 'group_compare':
      return (
        <>
          <div>{m.group_var} → {m.outcome}</div>
          {Object.entries(m.groups).map(([k, v]) => (
            <div key={k}>
              {k}: mean {v.mean} (sd {v.sd}, n {v.n})
            </div>
          ))}
          <div>Δ = {m.delta} · Cohen’s d = {m.cohens_d}</div>
        </>
      );
    case 'intervention_window':
      return (
        <>
          <div>{m.intervention_name} ({m.direction}) on {m.start_date}</div>
          <div>Outcome: {m.outcome}</div>
          <div>Pre {m.pre.window_days}d: mean {m.pre.mean} (n {m.pre.n})</div>
          <div>Post {m.post.window_days}d: mean {m.post.mean} (n {m.post.n})</div>
          <div>Δ = {m.delta} ({(m.pct_change * 100).toFixed(1)}%)</div>
        </>
      );
    case 'adherence_outcome':
      return (
        <>
          <div>{m.intervention_name} → {m.outcome}</div>
          <div>High weeks: mean {m.high_adherence.mean} (n {m.high_adherence.n_weeks})</div>
          <div>Low weeks: mean {m.low_adherence.mean} (n {m.low_adherence.n_weeks})</div>
          <div>Δ = {m.delta} · Cohen’s d = {m.cohens_d}</div>
        </>
      );
  }
}
