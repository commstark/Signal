'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { RecordButton } from '@/components/RecordButton';
import { enqueueCapture } from '@/lib/offline-queue';

interface ParsedSummary {
  entry_id: string;
  intent: string;
}

function CaptureInner() {
  const params = useSearchParams();
  const router = useRouter();
  const autoLaunch = params.get('mode') === 'auto';

  const [transcript, setTranscript] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  // If we come back online and there's queued audio, attempt to flush.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      import('@/lib/offline-queue').then(({ flushAll }) => flushAll().catch(() => {}));
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  async function onRecorded(blob: Blob, mimeType: string, _durationMs: number) {
    setError(null);
    setTranscript('');
    setParsed(null);

    const occurredAt = new Date().toISOString();

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const id = crypto.randomUUID();
      await enqueueCapture({ id, blob, mimeType, occurredAt });
      setQueued(true);
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
      setTranscript(t.transcript);

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
      if (!px.ok) throw new Error(`parse failed: ${px.status}`);
      setParsed(await px.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="p-4">
        <button
          onClick={() => router.push('/')}
          aria-label="close"
          className="text-ink-2 hover:text-ink"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-8 max-w-xl mx-auto w-full">
        <div className="w-full">
          <RecordButton autoLaunch={autoLaunch} onRecorded={onRecorded} />
        </div>

        {queued && (
          <p className="text-small text-ink-2 font-mono">
            offline · queued. will sync when online.
          </p>
        )}

        {transcript && (
          <div className="w-full space-y-2">
            <p className="text-micro text-ink-3 uppercase tracking-wide">transcript</p>
            <p className="text-body">{transcript}</p>
          </div>
        )}

        {parsed && (
          <div className="w-full">
            <p className="text-micro text-ink-3 uppercase tracking-wide mb-2">saved</p>
            <p className="text-small text-ink-2 font-mono">
              intent · {parsed.intent.replace(/_/g, ' ')}
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 h-9 px-4 border border-line rounded text-small"
            >
              done · back to dashboard
            </button>
          </div>
        )}

        {error && <p className="text-small text-signal-red">{error}</p>}
      </div>
    </main>
  );
}

function extFor(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

export default function CapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureInner />
    </Suspense>
  );
}
