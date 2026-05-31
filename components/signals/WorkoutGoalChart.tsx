'use client';

import { useMemo, useState } from 'react';
import type { WorkoutDay } from '@/lib/signals/aggregate';

interface Props {
  data: WorkoutDay[];
  // From users.targets.workouts_per_week (default 4 in lib/targets.ts).
  weeklyTarget: number;
}

// "Am I hitting my pace?" rather than "what did I train when".
//   Header  → "3 / 4 workouts this week" big number
//   Below   → last 6 weeks as rows; 7 cells per row, one per day
//             Filled lilac dot = worked out, hollow = rest, today ring
//   Click   → details for that day (exercise list, top set, duration)
export function WorkoutGoalChart({ data, weeklyTarget }: Props) {
  const [selected, setSelected] = useState<WorkoutDay | null>(null);

  // Index workouts by PST day for O(1) lookup.
  const byDate = useMemo(() => new Map(data.map((d) => [d.date, d])), [data]);

  const today = pstDay(new Date().toISOString());
  const todayIsoMonday = isoMonday(today);

  // Build last 6 ISO weeks (Mon-start). Current week first in the array,
  // displayed at top of the rendered list.
  const weeks: Array<{ monday: string; days: string[] }> = [];
  for (let i = 0; i < 6; i++) {
    const monday = shiftDate(todayIsoMonday, -7 * i);
    const days: string[] = [];
    for (let j = 0; j < 7; j++) days.push(shiftDate(monday, j));
    weeks.push({ monday, days });
  }

  const currentWeekCount = weeks[0].days.filter((d) => byDate.has(d)).length;
  const remaining = Math.max(0, weeklyTarget - currentWeekCount);
  const headerColor =
    currentWeekCount >= weeklyTarget ? 'text-ink' : remaining <= 1 ? 'text-ink' : 'text-ink-2';

  return (
    <div className="rounded-2xl bg-surface shadow-soft p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h3 className="text-h3">Workouts</h3>
          <p className="text-micro text-ink-3 font-mono">
            Filled dot = trained that day. Tap a day for what you did.
          </p>
        </div>
        <div className="text-right">
          <div className={`text-h1 font-semibold tabular-nums leading-none ${headerColor}`}>
            {currentWeekCount}
            <span className="text-small text-ink-3 font-mono"> / {weeklyTarget}</span>
          </div>
          <div className="text-micro text-ink-3 font-mono uppercase tracking-wide mt-1">
            workouts this week
          </div>
        </div>
      </header>

      <div className="space-y-2">
        {weeks.map((w, wi) => (
          <Row
            key={w.monday}
            monday={w.monday}
            days={w.days}
            byDate={byDate}
            todayStr={today}
            isCurrent={wi === 0}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>

      {selected && <SelectedDayPanel day={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Row({
  monday,
  days,
  byDate,
  todayStr,
  isCurrent,
  selected,
  onSelect,
}: {
  monday: string;
  days: string[];
  byDate: Map<string, WorkoutDay>;
  todayStr: string;
  isCurrent: boolean;
  selected: WorkoutDay | null;
  onSelect: (d: WorkoutDay) => void;
}) {
  const count = days.filter((d) => byDate.has(d)).length;
  return (
    <div className="grid grid-cols-[auto_repeat(7,1fr)_auto] gap-2 items-center">
      <span className="text-micro font-mono text-ink-3 w-16">
        {isCurrent ? 'This week' : labelForMonday(monday)}
      </span>
      {days.map((d) => {
        const cell = byDate.get(d);
        const isToday = d === todayStr;
        const isFuture = d > todayStr;
        const isSelected = selected && cell && selected.date === cell.date;
        if (cell) {
          return (
            <button
              key={d}
              onClick={() => onSelect(cell)}
              title={`${prettyDate(d)} · ${cell.exercises.length} exercise${cell.exercises.length === 1 ? '' : 's'}`}
              className={`h-6 rounded-full transition-all ${
                isSelected ? 'ring-2 ring-ink ring-offset-1' : ''
              } ${isToday ? 'ring-1 ring-ink/40' : ''} hover:scale-110`}
              style={{ background: 'rgba(212, 197, 232, 0.95)' }}
            />
          );
        }
        return (
          <div
            key={d}
            title={`${prettyDate(d)} · rest`}
            className={`h-6 rounded-full border ${
              isFuture ? 'border-line/50' : 'border-line'
            } ${isToday ? 'ring-1 ring-ink/40' : ''}`}
          />
        );
      })}
      <span className="text-micro font-mono text-ink-3 w-6 text-right tabular-nums">{count}</span>
    </div>
  );
}

function SelectedDayPanel({ day, onClose }: { day: WorkoutDay; onClose: () => void }) {
  return (
    <div className="mt-4 rounded-2xl bg-surface-2/60 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-body text-ink">{prettyDate(day.date)}</span>
        <button onClick={onClose} aria-label="Close" className="text-micro text-ink-3 hover:text-ink">
          ×
        </button>
      </div>
      {day.exercises.length === 0 ? (
        <p className="text-small text-ink-2">No exercises logged.</p>
      ) : (
        <ul className="space-y-1">
          {day.exercises.map((ex, i) => (
            <li key={i} className="text-small text-ink flex items-baseline gap-2 flex-wrap">
              <span>{ex.name}</span>
              <span className="text-micro font-mono text-ink-3 tabular-nums">
                {[
                  ex.muscle_group,
                  ex.exercise_type,
                  ex.top_weight_lb != null &&
                    `top ${ex.top_weight_lb} lb${ex.top_reps != null ? ` × ${ex.top_reps}` : ''}`,
                  ex.total_duration_s != null && ex.total_duration_s > 0 && fmtDur(ex.total_duration_s),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
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

function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pstDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function labelForMonday(ymd: string): string {
  const [, m, d] = ymd.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  return `${month} ${Number(d)}`;
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

function fmtDur(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
}
