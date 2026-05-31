import type { AdherenceCell } from '@/lib/signals/aggregate';

interface Props {
  data: AdherenceCell[];
}

// Calendar-grid heatmap, week columns. Mint = high adherence, peach = low,
// neutral border = no data logged that day.
export function AdherenceHeatmap({ data }: Props) {
  // Group by ISO week (Monday-start) then weekday.
  const byWeek = new Map<string, Record<number, AdherenceCell>>();
  for (const c of data) {
    const week = isoMonday(c.date);
    const dow = weekdayIndex(c.date); // 0..6, Monday=0
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
          Mint = mostly taken. Peach = mostly skipped. Blank = nothing logged.
        </p>
      </header>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `auto repeat(${weeks.length}, 18px)` }}>
          <div />
          {weeks.map(([w]) => (
            <div key={w} className="text-micro text-ink-3 text-center font-mono">
              {weekLabel(w)}
            </div>
          ))}
          {DOW.map((label, idx) => (
            <Row key={label} label={label} dow={idx} weeks={weeks} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  dow,
  weeks,
}: {
  label: string;
  dow: number;
  weeks: Array<[string, Record<number, AdherenceCell>]>;
}) {
  return (
    <>
      <div className="text-micro text-ink-3 pr-2 font-mono leading-none self-center">{label}</div>
      {weeks.map(([w, row]) => {
        const cell = row[dow];
        const ratio = cell && cell.total > 0 ? cell.taken / cell.total : null;
        const style: React.CSSProperties =
          ratio == null
            ? { background: 'transparent', border: '1px solid var(--line)' }
            : {
                background: heatmapColor(ratio),
                border: '1px solid transparent',
              };
        return (
          <div
            key={`${w}-${dow}`}
            className="w-[18px] h-[18px] rounded-[4px]"
            title={cell ? `${cell.date}: ${cell.taken}/${cell.total} taken` : `${w} ${dow}: no log`}
            style={style}
          />
        );
      })}
    </>
  );
}

function heatmapColor(ratio: number): string {
  // 1.0 -> deep mint, 0.0 -> peach. Soft blend in the middle.
  if (ratio >= 0.75) return 'rgba(184, 212, 194, 0.85)'; // mint strong
  if (ratio >= 0.5) return 'rgba(184, 212, 194, 0.55)';
  if (ratio >= 0.25) return 'rgba(244, 197, 179, 0.55)';
  return 'rgba(244, 197, 179, 0.85)'; // peach strong
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
  const [_, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}
