'use client';

import { useState } from 'react';
import { Stat } from './Stat';
import type { NutritionBreakdownRow } from '@/lib/today';

interface Props {
  value: string;
  label: string;
  meta?: string;
  field: 'protein_g' | 'calories_kcal' | 'fiber_g' | 'water_oz';
  unit: string; // 'g', 'kcal', etc.
  rows: NutritionBreakdownRow[];
  // Optional override that converts the raw stored value (e.g. water_oz) to
  // whatever the dashboard is displaying (e.g. liters). When omitted the
  // raw value is shown.
  formatContribution?: (v: number) => string;
}

export function NutritionTile({ value, label, meta, field, unit, rows, formatContribution }: Props) {
  const [open, setOpen] = useState(false);
  const contributions = rows
    .map((r) => ({ ...r, contrib: r[field] }))
    .filter((r) => r.contrib != null && r.contrib > 0);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left w-full">
        <Stat value={value} label={label} meta={meta} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface border border-line rounded p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-h3">{label}</h3>
              <span className="text-small text-ink-2 font-mono">{value}</span>
            </div>

            {contributions.length === 0 ? (
              <p className="text-body text-ink-2">no entries contributed to this stat yet.</p>
            ) : (
              <ul className="space-y-3">
                {contributions.map((r) => (
                  <li key={r.entry_id} className="border-l-2 border-line pl-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-micro font-mono text-ink-3 uppercase tracking-wide">
                        {formatTime(r.occurred_at)}
                      </span>
                      <span className="text-small font-mono text-ink">
                        {formatContribution ? formatContribution(r.contrib as number) : `${roundShort(r.contrib as number)}${unit}`}
                      </span>
                    </div>
                    {r.food_items.length > 0 && (
                      <p className="text-small text-ink-2 mt-1">
                        {r.food_items.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full h-9 border border-line rounded text-small mt-2"
            >
              close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(d)
    .toLowerCase()
    .replace(' am', 'a')
    .replace(' pm', 'p')
    .replace(/^0/, '');
}

function roundShort(n: number) {
  return Math.round(n * 10) / 10;
}
