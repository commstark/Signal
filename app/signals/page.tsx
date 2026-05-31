import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { loadSignalsBundle } from '@/lib/signals/aggregate';
import { fetchActiveInsights } from '@/lib/insights/load';
import { loadRecentChats } from '@/lib/signals/load-chats';
import { loadUserTargets } from '@/lib/targets';
import { MacrosChart } from '@/components/signals/MacrosChart';
import { WorkoutGoalChart } from '@/components/signals/WorkoutGoalChart';
import { AdherenceHeatmap } from '@/components/signals/AdherenceHeatmap';
import { DateRangeChip } from '@/components/signals/DateRangeChip';
import { AskPanel } from '@/components/signals/AskPanel';
import { InsightsSection } from '@/components/InsightsSection';

export const dynamic = 'force-dynamic';

const ALLOWED: Array<7 | 30 | 60 | 90> = [7, 30, 60, 90];

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  const { range } = await searchParams;
  const days = (ALLOWED.find((v) => String(v) === range) ?? 30) as 7 | 30 | 60 | 90;

  const [bundle, insights, chats, targets] = await Promise.all([
    loadSignalsBundle(user.id, days),
    fetchActiveInsights(user.id),
    loadRecentChats(user.id, 8),
    loadUserTargets(user.id),
  ]);

  return (
    <main className="min-h-dvh pb-12">
      {/* Mobile fallback — one-liner so curious taps know where to look. */}
      <div className="md:hidden p-6 text-center min-h-dvh flex flex-col items-center justify-center gap-3">
        <h1 className="text-h2">Signals</h1>
        <p className="text-body text-ink-2 leading-relaxed">
          Signals is desktop-only. Open this URL on a wider screen to see the trends and
          cross-domain insights.
        </p>
        <Link href="/today" className="text-small text-ink-2 hover:text-ink underline underline-offset-4 mt-2">
          ← Back to Today
        </Link>
      </div>

      {/* Desktop dashboard */}
      <div className="hidden md:block max-w-7xl mx-auto px-6">
        <header className="py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/today" className="text-ink-2 hover:text-ink" aria-label="Back">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-h1">Signals</h1>
              <p className="text-small text-ink-2 font-mono">
                {bundle.start} → {bundle.end} · {days} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DateRangeChip current={days} />
            <Link href="/ask" className="text-small text-ink-2 hover:text-ink font-mono">
              Ask
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Insights + Ask — left rail (5/12). Insight expand softly pushes
             the Ask panel down. */}
          <aside className="col-span-5 space-y-6">
            <InsightsSection insights={insights} />
            <AskPanel initialHistory={chats} />
          </aside>

          {/* Trends — right (7/12) */}
          <div className="col-span-7 space-y-6">
            <MacrosChart data={bundle.macros} interventions={bundle.interventions} />
            <WorkoutGoalChart
              data={bundle.workout_days}
              weeklyTarget={targets.workouts_per_week}
            />
            <AdherenceHeatmap data={bundle.adherence} />
          </div>
        </div>
      </div>
    </main>
  );
}
