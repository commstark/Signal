import Link from 'next/link';
import { ArrowLeft, Check, Circle } from 'lucide-react';
import {
  type TodaySummary,
  type TodayEntry,
  type TodayWorkouts,
  type TodaySupplements,
  type TodaySupplementItem,
  type NutritionBreakdownRow,
} from '@/lib/today';
import { Stat } from '@/components/Stat';
import { NutritionTile } from '@/components/NutritionTile';
import { TranscriptEditor } from '@/components/TranscriptEditor';
import { StatusDot, type StatusTone } from '@/components/StatusDot';
import { PendingRefresher } from '@/components/PendingRefresher';
import { InsightsSection } from '@/components/InsightsSection';
import type { ActiveInsight } from '@/lib/insights/load';
import { DEFAULT_TARGETS, type Targets } from '@/lib/targets';

export interface TodayViewData {
  today: TodaySummary;
  entries: TodayEntry[];
  workouts: TodayWorkouts;
  supplements: TodaySupplements;
  breakdown: NutritionBreakdownRow[];
}

// Presentational /today. The server page feeds real data; the first-run
// tour feeds a demo fixture (demo=true) so the genuine tiles render without
// any DB read or write. data-tour hooks let the tour highlight + scroll.
export function TodayView({
  today,
  entries,
  workouts,
  supplements,
  breakdown,
  insights,
  targets,
  demo = false,
}: TodayViewData & { insights?: ActiveInsight[]; targets?: Targets; demo?: boolean }) {
  const hasPending = !demo && entries.some((e) => e.parse_status === 'pending');
  const t = targets ?? DEFAULT_TARGETS;

  return (
    <main className="min-h-dvh pb-8">
      {!demo && <PendingRefresher active={hasPending} />}
      <header className="px-4 py-4 flex items-baseline justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-2 hover:text-ink" aria-label="Back" data-tour="back-link">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-h2">Today</h1>
            <p className="text-small text-ink-2 font-mono">{formatTodayLabel()} · PST</p>
          </div>
        </div>
        <div className="flex items-baseline gap-4">
          <Link
            href="/signals"
            className="hidden md:inline-block text-small text-ink-2 hover:text-ink font-mono"
          >
            Signals
          </Link>
          <Link href="/ask" className="text-small text-ink-2 hover:text-ink font-mono">
            Ask
          </Link>
          <Link href="/settings" className="text-small text-ink-2 hover:text-ink">
            Settings
          </Link>
        </div>
      </header>

      <section className="px-4 grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div data-tour="tile-protein">
          <NutritionTile
            value={`${today.protein_g}g`}
            label="protein"
            field="protein_g"
            unit="g"
            rows={breakdown}
            progress={today.protein_g / t.protein_g}
            tone="goal"
            target={{ value: t.protein_g, unit: 'g' }}
          />
        </div>
        <NutritionTile
          value={`${today.calories_kcal}`}
          label="calories"
          meta="±20-30%"
          field="calories_kcal"
          unit=" kcal"
          rows={breakdown}
          progress={today.calories_kcal / t.calories_kcal}
          tone="goal"
          target={{ value: t.calories_kcal, unit: ' kcal' }}
        />
        <NutritionTile
          value={`${today.carbs_g}g`}
          label="carbs"
          meta="sugar is a subset"
          field="carbs_g"
          unit="g"
          rows={breakdown}
          progress={today.carbs_g / t.carbs_g}
          tone="goal"
          target={{ value: t.carbs_g, unit: 'g' }}
        />
        <NutritionTile
          value={`${today.fiber_g}g`}
          label="fiber"
          field="fiber_g"
          unit="g"
          rows={breakdown}
          progress={today.fiber_g / t.fiber_g}
          tone="goal"
          target={{ value: t.fiber_g, unit: 'g' }}
        />
        <NutritionTile
          value={`${today.sugar_g}g`}
          label="sugar"
          meta={today.added_sugars_g > 0 ? `${today.added_sugars_g}g added` : undefined}
          field="sugar_g"
          unit="g"
          rows={breakdown}
          progress={today.sugar_g / t.sugar_g_ceiling}
          tone="ceiling"
          target={{ value: t.sugar_g_ceiling, unit: 'g' }}
        />
        <div data-tour="tile-water">
          <NutritionTile
            value={`${today.water_l}L`}
            label="water"
            field="water_ml"
            unit="ml"
            rows={breakdown}
            progress={today.water_ml / t.water_ml}
            tone="goal"
            target={{ value: t.water_ml / 1000, unit: 'L' }}
          />
        </div>
      </section>

      <section className="px-4 mt-6 grid grid-cols-2 gap-3">
        <Stat
          value={today.energy_avg != null ? today.energy_avg.toFixed(1) : '—'}
          label="energy avg"
          meta={`${today.entry_count} entries`}
        />
        <Stat value={today.mood_avg != null ? today.mood_avg.toFixed(1) : '—'} label="mood avg" />
      </section>

      {!demo && <InsightsSection insights={insights ?? []} />}

      <section className="px-4 mt-8" data-tour="workouts">
        <h2 className="text-h3 mb-3">Workouts</h2>
        {workouts.exercises.length === 0 && workouts.session_count === 0 ? (
          <p className="text-body text-ink-2">No workouts today.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-small text-ink-2 font-mono">
              {workouts.session_count} session{workouts.session_count === 1 ? '' : 's'}
              {' · '}
              {workouts.exercises.length} exercise{workouts.exercises.length === 1 ? '' : 's'}
              {workouts.total_minutes != null && ` · ${workouts.total_minutes} min`}
            </p>
            <ul className="space-y-2">
              {workouts.exercises.map((ex, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <div className="text-body flex items-baseline gap-2">
                    <span>{ex.exercise_name}</span>
                    <span className="text-micro font-mono text-ink-3">{formatTime(ex.occurred_at)}</span>
                  </div>
                  <div className="text-small text-ink-2 font-mono flex gap-2 flex-wrap">
                    {ex.muscle_group && <span>{ex.muscle_group}</span>}
                    {ex.exercise_type && <span>· {ex.exercise_type}</span>}
                    <span>· {ex.set_count} set{ex.set_count === 1 ? '' : 's'}</span>
                    {ex.top_set?.weight_lb != null && (
                      <span>
                        · top {ex.top_set.weight_lb} lb
                        {ex.top_set.reps != null && ` × ${ex.top_set.reps}`}
                      </span>
                    )}
                    {ex.set_durations_s && (
                      <span>· {ex.set_durations_s.map(formatDuration).join(' / ')}</span>
                    )}
                    {!ex.set_durations_s &&
                      ex.total_duration_s != null &&
                      ex.total_duration_s > 0 && <span>· {formatDuration(ex.total_duration_s)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="px-4 mt-8">
        <h2 className="text-h3 mb-3">Supplements</h2>
        <SupplementGroup label="morning" items={supplements.morning} />
        <SupplementGroup label="day" items={supplements.day} />
        <SupplementGroup label="night" items={supplements.night} />
        {supplements.unmatched.length > 0 && (
          <div className="mt-4">
            <p className="text-micro font-mono text-ink-3 uppercase tracking-wide mb-1">
              logged · not in stack
            </p>
            <ul className="space-y-1">
              {supplements.unmatched.map((u, i) => (
                <li key={i} className="text-small text-ink-2 flex items-center gap-2">
                  <Check size={14} className="text-ink-2" />
                  {u.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="px-4 mt-8" data-tour="log">
        <h2 className="text-h3 mb-3">Log</h2>
        {entries.length === 0 ? (
          <p className="text-body text-ink-2">No entries today.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((e) => (
              <li
                key={e.id}
                className={`border-l-2 pl-3 ${
                  e.parse_status === 'failed'
                    ? 'border-signal-red'
                    : e.parse_status === 'partial'
                    ? 'border-yellow-500'
                    : e.parse_status === 'pending'
                    ? 'border-signal-orange'
                    : 'border-line'
                }`}
              >
                <div className="text-micro font-mono text-ink-3 uppercase tracking-wide flex gap-3 items-center">
                  <StatusDot tone={entryTone(e.parse_status)} label={entryStatusLabel(e.parse_status)} />
                  <span>{formatTime(e.occurred_at)}</span>
                  <span>{e.intent.replace(/_/g, ' ')}</span>
                  {e.parse_status === 'pending' && <span className="text-signal-orange">Parsing…</span>}
                  {e.parse_status === 'partial' && <span className="text-yellow-500">Partial</span>}
                  {e.parse_status === 'failed' && <span className="text-signal-red">Failed</span>}
                </div>
                <div className="mt-1">
                  <TranscriptEditor entryId={e.id} initial={e.transcript} />
                </div>
                {e.parse_warnings && e.parse_warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {e.parse_warnings.map((w, i) => (
                      <li key={i} className="text-micro font-mono text-ink-3">
                        · {w}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function entryTone(status: TodayEntry['parse_status']): StatusTone {
  switch (status) {
    case 'pending':
      return 'progress';
    case 'partial':
      return 'warn';
    case 'failed':
      return 'error';
    // 'ok' and legacy null entries are done.
    default:
      return 'done';
  }
}

function entryStatusLabel(status: TodayEntry['parse_status']): string {
  switch (status) {
    case 'pending':
      return 'Parsing';
    case 'partial':
      return 'Partial';
    case 'failed':
      return 'Failed';
    default:
      return 'Done';
  }
}

function SupplementGroup({ label, items }: { label: string; items: TodaySupplementItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-micro font-mono text-ink-3 uppercase tracking-wide mb-2">{label}</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
        {items.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-small">
            {s.taken ? (
              <Check size={14} className="text-ink" />
            ) : s.skipped ? (
              <span className="w-[14px] text-center text-signal-red font-mono leading-none">×</span>
            ) : (
              <Circle size={12} className="text-ink-3" />
            )}
            <span className={s.taken ? 'text-ink' : 'text-ink-2'}>{s.name}</span>
            {s.dose && <span className="text-ink-3 font-mono text-micro">{s.dose}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return fmt
    .format(d)
    .toLowerCase()
    .replace(' am', 'a')
    .replace(' pm', 'p')
    .replace(/^0/, '');
}
