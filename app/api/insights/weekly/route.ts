import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyForAllUsers } from '@/lib/insights/run';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Vercel cron entry point. Authenticated by the CRON_SECRET env var via
// the standard Authorization: Bearer <secret> header Vercel sends.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  const results = await runWeeklyForAllUsers();
  return NextResponse.json({
    ok: true,
    users: results.length,
    insights_total: results.reduce((a, r) => a + r.insights_written, 0),
    cost_usd_total: round(results.reduce((a, r) => a + r.cost_usd, 0), 4),
    duration_ms: Date.now() - started,
    results,
  });
}

function round(n: number, p: number): number {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}
