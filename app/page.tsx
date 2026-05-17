'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RecordButton } from '@/components/RecordButton';
import { TranscriptEditor } from '@/components/TranscriptEditor';
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

function HomeInner() {
  const params = useSearchParams();
  const autoLaunch = params.get('mode') === 'auto';

  const [captures, setCaptures] = useState<Capture[]>([]);

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
          const p = (await px.json()) as { entry_id: string; intent: string };
          update(id, { status: 'saved', entryId: p.entry_id, intent: p.intent });
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
      <header className="p-4 flex justify-end">
        <Link href="/today" className="text-small text-ink-2 hover:text-ink font-mono">
          today
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6 max-w-xl mx-auto w-full">
        <div className="w-full">
          <RecordButton autoLaunch={autoLaunch} onRecorded={onRecorded} />
        </div>

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
      </div>
    </main>
  );
}

function CaptureRow({ capture }: { capture: Capture }) {
  const dotClass =
    capture.status === 'failed'
      ? 'bg-signal-red'
      : capture.status === 'saved' || capture.status === 'queued'
      ? 'bg-ink-2'
      : 'bg-[#EAB308] animate-pulse';

  const label = (() => {
    switch (capture.status) {
      case 'transcribing':
        return 'transcribing…';
      case 'parsing':
        return 'parsing…';
      case 'queued':
        return 'queued (offline)';
      case 'saved':
        return `saved · ${capture.intent?.replace(/_/g, ' ') ?? 'ok'}`;
      case 'failed':
        return capture.error ?? 'failed';
    }
  })();

  return (
    <li className="flex items-center gap-3 text-small font-mono text-ink-2">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
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
