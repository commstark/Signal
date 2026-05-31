'use client';

import { useState } from 'react';
import { Stat } from './Stat';
import type { NutritionBreakdownRow } from '@/lib/today';

interface Props {
  value: string;
  label: string;
  meta?: string;
  field: 'protein_g' | 'calories_kcal' | 'fiber_g' | 'water_ml' | 'sugar_g' | 'added_sugars_g' | 'carbs_g';
  unit: string; // 'g', 'kcal', etc.
  rows: NutritionBreakdownRow[];
  progress?: number;
  tone?: 'goal' | 'ceiling';
  target?: { value: number; unit: string };
}

export function NutritionTile({ value, label, meta, field, unit, rows, progress, tone, target }: Props) {
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
        <Stat value={value} label={label} meta={meta} progress={progress} tone={tone} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-3xl p-6 space-y-3 shadow-soft-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-h3">{label}</h3>
              <span className="text-small text-ink-2 font-mono tabular-nums">{value}</span>
            </div>

            {target && (
              <p className="text-micro text-ink-3 font-mono">
                {tone === 'ceiling' ? 'Ceiling' : 'Target'}: {target.value}{target.unit}
              </p>
            )}

            {contributions.length === 0 ? (
              <p className="text-body text-ink-2">No entries contributed to this stat yet.</p>
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
                    <span className="text-small font-mono text-ink shrink-0 tabular-nums">
                      {formatValue(r.contrib as number, field, unit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full h-10 rounded-xl bg-ink text-accent-fg text-small font-medium mt-2"
            >
              Close
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
