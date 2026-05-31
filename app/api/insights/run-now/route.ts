import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { runWeeklyForUser } from '@/lib/insights/run';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Manual trigger: any logged-in user can re-run their own weekly. No
// admin gate — it's bounded to their own user_id and cost-capped by the
// candidate filters + Sonnet's max_tokens.
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const result = await runWeeklyForUser(user.id);
  return NextResponse.json(result);
}
