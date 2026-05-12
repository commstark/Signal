import Link from 'next/link';
import { Circle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { fetchTodayForUser, fetchTodayEntries } from '@/lib/today';
import { Stat } from '@/components/Stat';
import { TranscriptEditor } from '@/components/TranscriptEditor';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const [today, entries] = await Promise.all([
    fetchTodayForUser(user.id),
    fetchTodayEntries(user.id),
  ]);

  return (
    <main className="min-h-dvh pb-28">
      <header className="px-4 py-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-h2">today</h1>
          <p className="text-small text-ink-2 font-mono">
            {formatTodayLabel()} · pst
          </p>
        </div>
        <Link href="/settings" className="text-small text-ink-2 hover:text-ink">
          settings
        </Link>
      </header>

      <section className="px-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          value={`${today.protein_g}g`}
          label="protein"
        />
        <Stat
          value={`${today.calories_kcal}`}
          label="calories"
          meta="±20-30%"
        />
        <Stat
          value={`${today.fiber_g}g`}
          label="fiber"
        />
        <Stat
          value={`${today.water_oz}oz`}
          label="water"
        />
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
        <h2 className="text-h3 mb-3">log</h2>
        {entries.length === 0 ? (
          <p className="text-body text-ink-2">no entries today.<br />tap record to add one.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <div className="text-micro font-mono text-ink-3 uppercase tracking-wide flex gap-3">
                  <span>{formatTime(e.occurred_at)}</span>
                  <span>{e.intent.replace(/_/g, ' ')}</span>
                </div>
                <div className="mt-1">
                  <TranscriptEditor entryId={e.id} initial={e.transcript} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-bg/95 backdrop-blur border-t border-line">
        <Link
          href="/capture"
          className="w-full h-16 rounded bg-accent text-accent-fg flex items-center justify-center gap-3 font-mono font-medium max-w-xl mx-auto"
        >
          <Circle size={18} fill="currentColor" />
          <span>record</span>
        </Link>
      </div>
    </main>
  );
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
