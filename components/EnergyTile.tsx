'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// 5-step energy pill. Tap a band and it POSTs to /api/energy/log, writing a
// normal entry + health_log row. Latest row wins on /today (re-tap to correct).
// Scores map to the 1-10 energy_score column: 2/4/6/8/10.
//
// Disabled in past-day view (readonly).

const BANDS: Array<{ score: 2 | 4 | 6 | 8 | 10; label: string }> = [
  { score: 2, label: 'Drained' },
  { score: 4, label: 'Low' },
  { score: 6, label: 'OK' },
  { score: 8, label: 'Good' },
  { score: 10, label: 'High' },
];

const GLYPH: Record<number, string> = {
  2: '✕',
  4: '−',
  6: '·',
  8: '+',
  10: '★',
};

interface Props {
  currentScore: number | null;
  currentDescriptor: string | null;
  readonly?: boolean;
}

export function EnergyTile({ currentScore, currentDescriptor, readonly }: Props) {
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
        const res = await fetch('/api/energy/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (e) {
        setOptimistic(null);
        setError(e instanceof Error ? e.message : 'failed');
      }
    });
  }

  const subtitle = active
    ? BANDS.find((b) => b.score === active)?.label ?? String(active)
    : currentDescriptor
    ? currentDescriptor
    : readonly
    ? 'not logged'
    : 'tap to log';

  return (
    <div
      className="rounded-2xl bg-surface shadow-soft p-4 sm:p-5 h-full flex flex-col"
      data-tour="energy"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-small text-ink-2">energy</div>
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
              aria-label={`Energy: ${b.label}`}
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
                {GLYPH[b.score]}
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
