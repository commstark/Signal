import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyForAllUsers } from '@/lib/insights/run';
import { requireCronAuth } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Vercel cron entry point. Authenticated by the CRON_SECRET env var via
// the standard Authorization: Bearer <secret> header Vercel sends.
export async function GET(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;
  const started = Date.now();
  const results = await runWeeklyForAllUsers();
  const insightsTotal = results.reduce((a, r) => a + r.insights_written, 0);
  const costTotal = round(results.reduce((a, r) => a + r.cost_usd, 0), 4);
  console.log(
    `weekly cron complete: users=${results.length} insights=${insightsTotal} cost_usd=${costTotal} duration_ms=${Date.now() - started}`,
  );
  return NextResponse.json({
    ok: true,
    users: results.length,
    insights_total: insightsTotal,
    cost_usd_total: costTotal,
    duration_ms: Date.now() - started,
    results,
  });
}

function round(n: number, p: number): number {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}
