'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const RANGES: Array<{ value: 7 | 30 | 60 | 90; label: string }> = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
];

export function DateRangeChip({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();

  function select(v: number) {
    const next = new URLSearchParams(params);
    next.set('range', String(v));
    router.push(`/signals?${next.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-soft-sm">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => select(r.value)}
          className={`text-micro font-mono px-3 py-1 rounded-full transition-colors ${
            current === r.value
              ? 'bg-accent text-accent-fg'
              : 'text-ink-2 hover:text-ink'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
