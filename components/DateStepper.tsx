'use client';

import { useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  ymd: string;       // currently displayed PST day
  todayYmd: string;  // today in PST (so we can disable forward at edge)
}

// Header date control for /today. Arrows step back / forward one PST day;
// the label opens a native date picker so a tap goes to any past day.
export function DateStepper({ ymd, todayYmd }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  function go(nextYmd: string) {
    const next = new URLSearchParams(search);
    if (nextYmd === todayYmd) next.delete('d');
    else next.set('d', nextYmd);
    const qs = next.toString();
    router.push(`/today${qs ? `?${qs}` : ''}`);
  }

  const prev = shiftDate(ymd, -1);
  const next = shiftDate(ymd, 1);
  const canForward = ymd < todayYmd;
  const isToday = ymd === todayYmd;
  const label = isToday
    ? 'Today'
    : ymd === shiftDate(todayYmd, -1)
    ? 'Yesterday'
    : prettyDate(ymd);

  return (
    <div className="flex items-baseline gap-2">
      <button
        onClick={() => go(prev)}
        className="text-ink-2 hover:text-ink p-1 -ml-1"
        aria-label="Previous day"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.focus()}
        className="text-h2 font-semibold hover:text-ink-2 transition-colors leading-none"
      >
        {label}
      </button>
      <input
        ref={dateInputRef}
        type="date"
        value={ymd}
        max={todayYmd}
        onChange={(e) => {
          if (e.target.value) go(e.target.value);
        }}
        // visually hidden but the native picker still works
        className="sr-only"
      />
      <button
        onClick={() => canForward && go(next)}
        disabled={!canForward}
        className="text-ink-2 hover:text-ink p-1 disabled:text-ink-3 disabled:cursor-not-allowed"
        aria-label="Next day"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  const dow = new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  return `${dow}, ${month} ${Number(d)}, ${y}`;
}
