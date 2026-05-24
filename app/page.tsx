'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RecordButton } from '@/components/RecordButton';
import { TranscriptEditor } from '@/components/TranscriptEditor';
import { AskLaterInput } from '@/components/AskLaterInput';
import { StatusDot, type StatusTone } from '@/components/StatusDot';
import { enqueueCapture } from '@/lib/offline-queue';

type CaptureStatus = 'transcribing' | 'parsing' | 'saved' | 'failed' | 'queued';

interface Capture {
  id: string;
  status: CaptureStatus;
  startedAt: number;
  transcript?: string;
  entryId?: string;
  intent?: string;
  error?: string;
}

const MAX_VISIBLE = 5;

interface PrefsHint {
  term: string;
  phrase: string;
}

function HomeInner() {
  const params = useSearchParams();
  const autoLaunch = params.get('mode') === 'auto';

  const [captures, setCaptures] = useState<Capture[]>([]);
  // Surfaced when a food log used a vague portion the user hasn't pinned
  // down yet. Re-fires on every vague log until they save a preference
  // (the server only sends it while no matching calibration exists).
  const [prefsTip, setPrefsTip] = useState<PrefsHint | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      import('@/lib/offline-queue').then(({ flushAll }) => flushAll().catch(() => {}));
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const update = useCallback((id: string, patch: Partial<Capture>) => {
    setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  // Saved/queued rows fade out after a few seconds so the list doesn't
  // accumulate. Failed rows stay so the user can read the error.
  useEffect(() => {
    const terminal = captures.find(
      (c) => (c.status === 'saved' || c.status === 'queued') && Date.now() - c.startedAt > 0,
    );
    if (!terminal) return;
    const t = setTimeout(() => {
      setCaptures((prev) => prev.filter((c) => c.id !== terminal.id));
    }, 8000);
    return () => clearTimeout(t);
  }, [captures]);

  const onRecorded = useCallback(
    (blob: Blob, mimeType: string, _durationMs: number) => {
      const id = crypto.randomUUID();
      const occurredAt = new Date().toISOString();
      setCaptures((prev) =>
        [{ id, status: 'transcribing' as CaptureStatus, startedAt: Date.now() }, ...prev].slice(
          0,
          MAX_VISIBLE,
        ),
      );

      // Fire and forget. Even if the user navigates away, the in-flight
      // fetches keep running and the server still writes to the DB —
      // they just won't see the UI status update.
      (async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          await enqueueCapture({ id, blob, mimeType, occurredAt });
          update(id, { status: 'queued' });
          return;
        }
        try {
          const form = new FormData();
          form.append(
            'audio',
            new File([blob], `capture.${extFor(mimeType)}`, { type: mimeType }),
          );
          const tx = await fetch('/api/transcribe', { method: 'POST', body: form });
          if (!tx.ok) throw new Error(`transcribe failed: ${tx.status}`);
          const t = (await tx.json()) as {
            transcript: string;
            audio_url: string | null;
            audio_duration_s: number | null;
          };
          update(id, { status: 'parsing', transcript: t.transcript });

          const px = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: t.transcript,
              audio_url: t.audio_url,
              audio_duration_s: t.audio_duration_s,
              occurred_at: occurredAt,
            }),
          });
          if (!px.ok) {
            const body = await px.json().catch(() => null);
            throw new Error(body?.error ?? `parse failed: ${px.status}`);
          }
          const p = (await px.json()) as {
            entry_id: string;
            intent: string;
            prefs_hint?: PrefsHint | null;
          };
          update(id, { status: 'saved', entryId: p.entry_id, intent: p.intent });
          if (p.prefs_hint) setPrefsTip(p.prefs_hint);
        } catch (e) {
          update(id, { status: 'failed', error: e instanceof Error ? e.message : 'failed' });
        }
      })();
    },
    [update],
  );

  const latestSaved = captures.find((c) => c.status === 'saved' && c.entryId && c.transcript);

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="p-4 flex justify-end gap-4">
        <Link href="/stack" className="text-small text-ink-2 hover:text-ink font-mono">
          account
        </Link>
        <Link href="/ask" className="text-small text-ink-2 hover:text-ink font-mono">
          ask
        </Link>
        <Link
          href="/today"
          className="text-small text-ink-2 hover:text-ink font-mono"
          data-tour="today-link"
        >
          today
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6 max-w-xl mx-auto w-full">
        <div className="w-full">
          <RecordButton autoLaunch={autoLaunch} onRecorded={onRecorded} />
        </div>

        {captures.length === 0 && !latestSaved && <ExampleHints />}

        {captures.length > 0 && (
          <ul className="w-full space-y-1">
            {captures.map((c) => (
              <CaptureRow key={c.id} capture={c} />
            ))}
          </ul>
        )}

        {latestSaved && (
          <div className="w-full space-y-2">
            <p className="text-micro text-ink-3 uppercase tracking-wide">latest transcript</p>
            <TranscriptEditor entryId={latestSaved.entryId!} initial={latestSaved.transcript!} />
          </div>
        )}

        {prefsTip && (
          <div className="w-full flex items-start gap-2 text-small text-ink-2 leading-snug">
            <span className="font-mono text-micro uppercase tracking-wide text-ink-3 mt-0.5 shrink-0">
              prefs
            </span>
            <p className="flex-1">
              you said &ldquo;{prefsTip.phrase}&rdquo;. tell me once —{' '}
              <span className="text-ink">&ldquo;from now on a {prefsTip.term} is …&rdquo;</span> — and
              I&rsquo;ll use it every time.
            </p>
            <button
              onClick={() => setPrefsTip(null)}
              aria-label="dismiss"
              className="text-ink-3 hover:text-ink shrink-0 leading-none"
            >
              ×
            </button>
          </div>
        )}

        <div className="w-full pt-4 border-t border-line">
          <AskLaterInput />
        </div>
      </div>
    </main>
  );
}

const EXAMPLES: Array<{ label: string; quote: string }> = [
  // food
  { label: 'food', quote: 'had a turkey sandwich and a black coffee.' },
  { label: 'food', quote: 'two scrambled eggs on toast with avocado.' },
  { label: 'food', quote: 'salmon bowl with rice and greens for dinner.' },
  { label: 'food', quote: 'banana and a protein shake post-workout.' },
  { label: 'food', quote: '8oz grilled chicken and roasted broccoli.' },
  // workout
  { label: 'workout', quote: 'deadlifts 5x5 at 315, then 20 min easy bike.' },
  { label: 'workout', quote: 'bjj rolling, six rounds of five minutes.' },
  { label: 'workout', quote: 'bench 4x8 at 185, pull-ups 3x10 bodyweight.' },
  { label: 'workout', quote: 'dead hangs three sets of 45 seconds.' },
  { label: 'workout', quote: '30 minute zone two run, 5k easy.' },
  // stack
  { label: 'stack', quote: 'from now on I take 400 IU vitamin E in the morning.' },
  { label: 'stack', quote: 'adding 5g creatine to my morning stack.' },
  { label: 'stack', quote: 'starting magnesium glycinate 600mg before bed.' },
  { label: 'stack', quote: 'switching my protein shake to whey isolate.' },
  { label: 'stack', quote: 'stopping ashwagandha — done with that experiment.' },
  // prefs
  { label: 'prefs', quote: 'for me, a serving of meat is half a pound.' },
  { label: 'prefs', quote: 'from now on a cup is 295ml for me.' },
  { label: 'prefs', quote: 'my protein shake is 30g of protein.' },
  { label: 'prefs', quote: 'in general, a serving of rice is one cup cooked.' },
  { label: 'prefs', quote: 'for me, a slice of pizza is around 350 kcal.' },
];

function ExampleHints() {
  // One random example per page load. Picks fresh on each mount so a
  // refresh always surfaces something new. Uses state seeded once to
  // avoid hydration mismatch.
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  return (
    <p className="w-full text-small text-ink-2 leading-snug">
      <span className="font-mono text-micro uppercase tracking-wide text-ink-3 mr-2">
        {example.label}
      </span>
      &ldquo;{example.quote}&rdquo;
    </p>
  );
}

const CAPTURE_TONE: Record<CaptureStatus, StatusTone> = {
  transcribing: 'progress',
  parsing: 'progress',
  saved: 'done',
  queued: 'idle',
  failed: 'error',
};

function CaptureRow({ capture }: { capture: Capture }) {
  const label = (() => {
    switch (capture.status) {
      case 'transcribing':
        return 'transcribing…';
      case 'parsing':
        return 'parsing…';
      case 'queued':
        return 'queued (offline)';
      case 'saved':
        return `done · ${capture.intent?.replace(/_/g, ' ') ?? 'ok'}`;
      case 'failed':
        return capture.error ?? 'failed';
    }
  })();

  return (
    <li className="flex items-center gap-3 text-small font-mono text-ink-2">
      <StatusDot tone={CAPTURE_TONE[capture.status]} />
      <span className={capture.status === 'failed' ? 'text-signal-red' : ''}>{label}</span>
    </li>
  );
}

function extFor(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
