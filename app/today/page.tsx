import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import {
  fetchTodayForUser,
  fetchTodayEntries,
  fetchTodayWorkouts,
  fetchTodaySupplements,
  fetchTodayNutritionBreakdown,
} from '@/lib/today';
import { fetchActiveInsights } from '@/lib/insights/load';
import { loadUserTargets } from '@/lib/targets';
import { TodayView } from '@/components/TodayView';
import { demoTodayData } from '@/lib/demo';

export const dynamic = 'force-dynamic';

const TZ = 'America/Los_Angeles';

function pstToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; d?: string }>;
}) {
  // First-run tour: render the real tiles with a demo day. No auth, no
  // DB read, nothing written — it just shows what /today will look like.
  const params = await searchParams;
  if (params.tour) {
    return <TodayView {...demoTodayData()} demo />;
  }

  const user = await requireUser();
  const todayYmd = pstToday();

  // Date stepper: ?d=YYYY-MM-DD walks back through history. Future dates
  // and malformed values redirect to today (no param) so the URL stays
  // honest.
  let ymd = todayYmd;
  if (params.d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.d) || params.d > todayYmd) {
      redirect('/today');
    }
    ymd = params.d;
  }
  // Construct a Date at PST-noon of the target day so the dayBoundsPst
  // formatter resolves the same YYYY-MM-DD on both ends of DST.
  const targetNow = new Date(`${ymd}T20:00:00Z`); // ~noon in LA across DST

  const [today, entries, workouts, supplements, breakdown, insights, targets] = await Promise.all([
    fetchTodayForUser(user.id, targetNow),
    fetchTodayEntries(user.id, targetNow),
    fetchTodayWorkouts(user.id, targetNow),
    fetchTodaySupplements(user.id, targetNow),
    fetchTodayNutritionBreakdown(user.id, targetNow),
    fetchActiveInsights(user.id),
    loadUserTargets(user.id),
  ]);

  return (
    <TodayView
      today={today}
      entries={entries}
      workouts={workouts}
      supplements={supplements}
      breakdown={breakdown}
      insights={insights}
      targets={targets}
      ymd={ymd}
      todayYmd={todayYmd}
    />
  );
}
