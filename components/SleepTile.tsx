'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// 5-step sleep pill. Tap a band and it POSTs to /api/sleep/log, which
// writes a normal entry + health_log row (same audit trail as voice).
// Re-tapping a different band logs a new row; the latest one wins on
// /today.
//
// Disabled in past-day view (readonly) — tapping a band only makes sense
// for today.
const BANDS: Array<{ score: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { score: 1, label: 'Horrible' },
  { score: 2, label: 'Bad' },
  { score: 3, label: 'OK' },
  { score: 4, label: 'Good' },
  { score: 5, label: 'Great' },
];

interface Props {
  currentScore: number | null;
  currentDescriptor: string | null;
  currentHours: number | null;
  readonly?: boolean;
}

export function SleepTile({ currentScore, currentDescriptor, currentHours, readonly }: Props) {
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const active = optimistic ?? currentScore;

  function pick(score: number) {
    if (readonly) return;
    setError(null);
    setOptimistic(score);
    startTransition(async () => {
      try {
        const res = await fetch('/api/sleep/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        // Pull fresh /today data so other tiles (entry count, log section) update.
        router.refresh();
      } catch (e) {
        setOptimistic(null);
        setError(e instanceof Error ? e.message : 'failed');
      }
    });
  }

  const subtitle = active
    ? `${BANDS.find((b) => b.score === active)?.label}${
        currentHours != null ? ` · ${formatHours(currentHours)}` : ''
      }`
    : currentDescriptor
    ? currentDescriptor
    : readonly
    ? 'not logged'
    : 'tap to log';

  return (
    <div
      className="rounded-2xl bg-surface shadow-soft p-4 sm:p-5 h-full flex flex-col"
      data-tour="sleep"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-small text-ink-2">sleep</div>
        <div className="text-micro font-mono text-ink-3">{subtitle}</div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {BANDS.map((b) => {
          const isActive = active === b.score;
          return (
            <button
              key={b.score}
              type="button"
              onClick={() => pick(b.score)}
              disabled={pending || readonly}
              aria-pressed={isActive}
              aria-label={`Sleep: ${b.label}`}
              className={[
                'flex flex-col items-center justify-center rounded-xl py-2 px-1 transition-colors',
                'text-micro font-mono',
                isActive
                  ? 'bg-ink text-bg shadow-soft-sm'
                  : 'bg-surface-2 text-ink-2 hover:text-ink hover:bg-line',
                readonly ? 'cursor-default opacity-70' : 'cursor-pointer',
                pending && !isActive ? 'opacity-50' : '',
              ].join(' ')}
            >
              <span aria-hidden className="text-base leading-none mb-1">
                {EMOJI[b.score]}
              </span>
              <span className="leading-none">{b.label}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-micro font-mono text-signal-red">{error}</p>}
    </div>
  );
}

// Visual hint only — small mood-curve glyphs so the user can scan the row
// without reading every word. Kept inside an aria-hidden span so screen
// readers stick to the label text.
const EMOJI: Record<number, string> = {
  1: '✕',
  2: '−',
  3: '·',
  4: '+',
  5: '★',
};

function formatHours(h: number): string {
  const n = Math.round(h * 10) / 10;
  if (Number.isInteger(n)) return `${n}h`;
  return `${n}h`;
}
