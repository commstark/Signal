import Link from 'next/link';
import { ArrowLeft, Check, Circle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import {
  fetchTodayForUser,
  fetchTodayEntries,
  fetchTodayWorkouts,
  fetchTodaySupplements,
  type TodaySupplementItem,
} from '@/lib/today';
import { Stat } from '@/components/Stat';
import { TranscriptEditor } from '@/components/TranscriptEditor';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const user = await requireUser();
  const [today, entries, workouts, supplements] = await Promise.all([
    fetchTodayForUser(user.id),
    fetchTodayEntries(user.id),
    fetchTodayWorkouts(user.id),
    fetchTodaySupplements(user.id),
  ]);

  return (
    <main className="min-h-dvh pb-8">
      <header className="px-4 py-4 flex items-baseline justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-2 hover:text-ink" aria-label="back">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-h2">today</h1>
            <p className="text-small text-ink-2 font-mono">
              {formatTodayLabel()} · pst
            </p>
          </div>
        </div>
        <Link href="/settings" className="text-small text-ink-2 hover:text-ink">
          settings
        </Link>
      </header>

      <section className="px-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat value={`${today.protein_g}g`} label="protein" />
        <Stat value={`${today.calories_kcal}`} label="calories" meta="±20-30%" />
        <Stat value={`${today.fiber_g}g`} label="fiber" />
        <Stat value={`${today.water_oz}oz`} label="water" />
      </section>

      <section className="px-4 mt-6 grid grid-cols-2 gap-3">
        <Stat
          value={today.energy_avg != null ? today.energy_avg.toFixed(1) : '—'}
          label="energy avg"
          meta={`${today.entry_count} entries`}
        />
        <Stat
          value={today.mood_avg != null ? today.mood_avg.toFixed(1) : '—'}
          label="mood avg"
        />
      </section>

      <section className="px-4 mt-8">
        <h2 className="text-h3 mb-3">workouts</h2>
        {workouts.exercises.length === 0 && workouts.session_count === 0 ? (
          <p className="text-body text-ink-2">no workouts today.</p>
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
                  <div className="text-body">{ex.exercise_name}</div>
                  <div className="text-small text-ink-2 font-mono flex gap-2 flex-wrap">
                    {ex.muscle_group && <span>{ex.muscle_group}</span>}
                    {ex.exercise_type && <span>· {ex.exercise_type}</span>}
                    <span>· {ex.set_count} set{ex.set_count === 1 ? '' : 's'}</span>
                    {ex.total_volume_lb != null && ex.total_volume_lb > 0 && (
                      <span>· {ex.total_volume_lb} lb total</span>
                    )}
                    {ex.total_duration_s != null && ex.total_duration_s > 0 && (
                      <span>· {formatDuration(ex.total_duration_s)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="px-4 mt-8">
        <h2 className="text-h3 mb-3">supplements</h2>
        <SupplementGroup label="morning" items={supplements.morning} />
        <SupplementGroup label="night" items={supplements.night} />
        {supplements.other.length > 0 && (
          <SupplementGroup label="other" items={supplements.other} />
        )}
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

      <section className="px-4 mt-8">
        <h2 className="text-h3 mb-3">log</h2>
        {entries.length === 0 ? (
          <p className="text-body text-ink-2">no entries today.</p>
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
                    : 'border-line'
                }`}
              >
                <div className="text-micro font-mono text-ink-3 uppercase tracking-wide flex gap-3 items-center">
                  <span>{formatTime(e.occurred_at)}</span>
                  <span>{e.intent.replace(/_/g, ' ')}</span>
                  {e.parse_status === 'partial' && (
                    <span className="text-yellow-500">partial</span>
                  )}
                  {e.parse_status === 'failed' && (
                    <span className="text-signal-red">failed</span>
                  )}
                </div>
                <div className="mt-1">
                  <TranscriptEditor entryId={e.id} initial={e.transcript} />
                </div>
                {e.parse_warnings && e.parse_warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {e.parse_warnings.map((w, i) => (
                      <li
                        key={i}
                        className="text-micro font-mono text-ink-3"
                      >
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

function SupplementGroup({ label, items }: { label: string; items: TodaySupplementItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-micro font-mono text-ink-3 uppercase tracking-wide mb-2">
        {label}
      </p>
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
            <span className={s.taken ? 'text-ink' : 'text-ink-2'}>
              {s.name}
            </span>
            {s.dose && (
              <span className="text-ink-3 font-mono text-micro">{s.dose}</span>
            )}
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
