'use client';

import { useState } from 'react';
import { Stat } from './Stat';
import type { NutritionBreakdownRow } from '@/lib/today';

interface Props {
  value: string;
  label: string;
  meta?: string;
  field: 'protein_g' | 'calories_kcal' | 'fiber_g' | 'water_ml';
  unit: string; // 'g', 'kcal', etc.
  rows: NutritionBreakdownRow[];
}

export function NutritionTile({ value, label, meta, field, unit, rows }: Props) {
  const [open, setOpen] = useState(false);
  const contributions = rows
    .map((r) => ({
      key: r.key,
      occurred_at: r.occurred_at,
      name: r.name,
      contrib: r[field],
    }))
    .filter((r) => r.contrib != null && r.contrib > 0);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left w-full h-full">
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
              <ul className="space-y-2">
                {contributions.map((r) => (
                  <li
                    key={r.key}
                    className="flex items-baseline justify-between gap-3 border-l-2 border-line pl-3"
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-small text-ink truncate">{r.name}</span>
                      <span className="text-micro font-mono text-ink-3 shrink-0">
                        {formatTime(r.occurred_at)}
                      </span>
                    </div>
                    <span className="text-small font-mono text-ink shrink-0">
                      {formatValue(r.contrib as number, field, unit)}
                    </span>
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

function formatValue(v: number, field: Props['field'], unit: string) {
  if (field === 'water_ml') {
    return v >= 1000 ? `${Math.round((v / 1000) * 100) / 100}L` : `${Math.round(v)}ml`;
  }
  return `${roundShort(v)}${unit}`;
}
