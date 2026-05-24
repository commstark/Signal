import { requireUser } from '@/lib/auth';
import {
  fetchTodayForUser,
  fetchTodayEntries,
  fetchTodayWorkouts,
  fetchTodaySupplements,
  fetchTodayNutritionBreakdown,
} from '@/lib/today';
import { TodayView } from '@/components/TodayView';
import { demoTodayData } from '@/lib/demo';

export const dynamic = 'force-dynamic';

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  // First-run tour: render the real tiles with a demo day. No auth, no
  // DB read, nothing written — it just shows what /today will look like.
  const { tour } = await searchParams;
  if (tour) {
    return <TodayView {...demoTodayData()} demo />;
  }

  const user = await requireUser();
  const [today, entries, workouts, supplements, breakdown] = await Promise.all([
    fetchTodayForUser(user.id),
    fetchTodayEntries(user.id),
    fetchTodayWorkouts(user.id),
    fetchTodaySupplements(user.id),
    fetchTodayNutritionBreakdown(user.id),
  ]);

  return (
    <TodayView
      today={today}
      entries={entries}
      workouts={workouts}
      supplements={supplements}
      breakdown={breakdown}
    />
  );
}
