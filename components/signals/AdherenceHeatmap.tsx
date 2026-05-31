'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdherenceCell } from '@/lib/signals/aggregate';

interface Props {
  data: AdherenceCell[];
}

// Calendar-grid heatmap, week columns.
//   lilac  = 100% taken (matches the goal-fill tiles — "you hit it")
//   mint   =  80–99% taken
//   peach  =  <80% taken
//   blank  = nothing logged that day
// Tap any cell → see exactly which supplements were taken vs. skipped.
export function AdherenceHeatmap({ data }: Props) {
  const [selected, setSelected] = useState<AdherenceCell | null>(null);

  const byWeek = new Map<string, Record<number, AdherenceCell>>();
  for (const c of data) {
    const week = isoMonday(c.date);
    const dow = weekdayIndex(c.date);
    let row = byWeek.get(week);
    if (!row) {
      row = {};
      byWeek.set(week, row);
    }
    row[dow] = c;
  }
  const weeks = Array.from(byWeek.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="rounded-2xl bg-surface shadow-soft p-5">
      <header className="mb-3">
        <h3 className="text-h3">Supplement adherence</h3>
        <p className="text-micro text-ink-3 font-mono">
          % of your active stack taken. Lilac = 100%. Mint = 80%+. Peach = below 80%. Blank = nothing logged. Hatched = excluded (vacation / sick). Tap a day for taken / skipped / missing.
        </p>
      </header>
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-1.5"
          style={{ gridTemplateColumns: `auto repeat(${weeks.length}, 18px)` }}
        >
          <div />
          {weeks.map(([w], idx) => (
            <div
              key={w}
              className="text-[10px] text-ink-3 text-center font-mono leading-none h-3 flex items-end justify-center"
            >
              {/* Every other week label so they stop overlapping at 18px column width. */}
              {idx % 2 === 0 ? weekLabel(w) : ''}
            </div>
          ))}
          {DOW.map((label, idx) => (
            <Row
              key={label}
              label={label}
              dow={idx}
              weeks={weeks}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      {selected && <SelectedDayPanel cell={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Row({
  label,
  dow,
  weeks,
  selected,
  onSelect,
}: {
  label: string;
  dow: number;
  weeks: Array<[string, Record<number, AdherenceCell>]>;
  selected: AdherenceCell | null;
  onSelect: (c: AdherenceCell) => void;
}) {
  return (
    <>
      <div className="text-micro text-ink-3 pr-2 font-mono leading-none self-center">{label}</div>
      {weeks.map(([w, row]) => {
        const cell = row[dow];
        const empty = !cell || cell.total === 0;
        const excluded = cell?.excluded === true;
        const ratio = !empty && !excluded ? cell!.taken / cell!.total : null;
        const isSelected = selected && cell && selected.date === cell.date;
        // Every real cell is tappable — even an empty one — so the user
        // can mark "I was on vacation, exclude this day" without needing
        // to have logged something first.
        const tappable = !!cell;
        // Excluded days get a diagonal hatch instead of a solid color so
        // they read as "intentionally skipped" rather than "missed".
        const style: React.CSSProperties = excluded
          ? {
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--ink-3) 0, var(--ink-3) 1px, transparent 1px, transparent 4px)',
              opacity: 0.6,
              border: '1px solid var(--line)',
            }
          : empty
          ? { background: 'transparent', border: '1px solid var(--line)' }
          : { background: heatmapColor(ratio as number), border: '1px solid transparent' };
        return (
          <button
            key={`${w}-${dow}`}
            onClick={() => cell && onSelect(cell)}
            disabled={!tappable}
            title={
              cell
                ? excluded
                  ? `${cell.date}: excluded${cell.exclude_reason ? ` · ${cell.exclude_reason}` : ''}`
                  : cell.total > 0
                  ? `${cell.date}: ${cell.taken}/${cell.total} taken`
                  : `${cell.date}: nothing logged`
                : ''
            }
            className={`w-[18px] h-[18px] rounded-[4px] transition-all ${
              isSelected ? 'ring-2 ring-ink ring-offset-1' : ''
            } ${tappable ? 'hover:scale-110' : 'cursor-default'}`}
            style={style}
          />
        );
      })}
    </>
  );
}

function heatmapColor(ratio: number): string {
  if (ratio >= 1) return 'rgba(212, 197, 232, 0.85)'; // lilac — 100%
  if (ratio >= 0.8) return 'rgba(184, 212, 194, 0.85)'; // mint — 80–99%
  return 'rgba(244, 197, 179, 0.85)'; // peach — <80%
}

function SelectedDayPanel({ cell, onClose }: { cell: AdherenceCell; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = cell.total > 0 ? Math.round((cell.taken / cell.total) * 100) : 0;

  async function setExcluded(excluded: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/signals/exclude-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: cell.date, excluded, reason: reason.trim() || undefined }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? `Request failed: ${r.status}`);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-surface-2/60 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-body text-ink">{prettyDate(cell.date)}</span>
          {cell.excluded ? (
            <span className="text-small text-ink-2 font-mono">
              Excluded{cell.exclude_reason ? ` · ${cell.exclude_reason}` : ''}
            </span>
          ) : cell.total > 0 ? (
            <span className="text-small text-ink-2 font-mono tabular-nums">
              {cell.taken}/{cell.total} of stack · {pct}%
            </span>
          ) : (
            <span className="text-small text-ink-3 font-mono">No logs</span>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="text-micro text-ink-3 hover:text-ink">
          ×
        </button>
      </div>

      {!cell.excluded && cell.total > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <ItemList title="Taken" items={cell.taken_items} icon="✓" iconClass="text-ink" />
          <ItemList title="Skipped" items={cell.skipped_items} icon="✗" iconClass="text-signal-red" />
          <ItemList title="Missing" items={cell.missing_items} icon="–" iconClass="text-ink-3" />
        </div>
      )}

      <div className="pt-2 border-t border-line space-y-2">
        {cell.excluded ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-micro text-ink-3">
              Excluded from adherence + insight denominators. Restore to include again.
            </p>
            <button
              onClick={() => setExcluded(false)}
              disabled={busy}
              className="text-micro text-ink-2 hover:text-ink underline underline-offset-4 disabled:opacity-50 shrink-0"
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (vacation, sick, …)"
              className="flex-1 min-w-[10rem] text-small bg-bg border border-line rounded-xl px-3 py-1.5 focus:border-ink focus:outline-none"
            />
            <button
              onClick={() => setExcluded(true)}
              disabled={busy}
              className="text-small text-ink-2 hover:text-ink border border-line rounded-xl px-3 py-1.5 disabled:opacity-50 shrink-0"
            >
              {busy ? 'Excluding…' : 'Exclude this day'}
            </button>
          </div>
        )}
        {error && <p className="text-micro text-signal-red">{error}</p>}
      </div>
    </div>
  );
}

function ItemList({
  title,
  items,
  icon,
  iconClass,
}: {
  title: string;
  items: string[];
  icon: string;
  iconClass: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-micro text-ink-3 uppercase tracking-wide">{title}</p>
      {items.length === 0 ? (
        <p className="text-small text-ink-3">—</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((name, i) => (
            <li key={`${name}-${i}`} className="flex items-center gap-2 text-small text-ink">
              <span className={`font-mono leading-none ${iconClass}`}>{icon}</span>
              <span>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isoMonday(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function weekdayIndex(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

function weekLabel(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
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
