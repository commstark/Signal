import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { RenderedChartData } from './spec';
import { tool_make_chart } from './tools';

export interface ChatTurnRow {
  id: string;
  question: string;
  answer: string;
  charts: RenderedChartData[];
  cost_usd: number;
  duration_ms: number | null;
}

// Load the user's recent /signals Q&A turns. Charts are re-rendered
// against current data so the picture is always fresh — the stored spec
// is the source of truth, the points are a cache that follows.
export async function loadRecentChats(userId: string, limit = 8): Promise<ChatTurnRow[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('signals_chats')
    .select('id, question, answer_text, chart_specs, cost_usd, duration_ms, status')
    .eq('user_id', userId)
    .eq('status', 'ok')
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as Array<{
    id: string;
    question: string;
    answer_text: string | null;
    chart_specs: unknown;
    cost_usd: number;
    duration_ms: number | null;
  }>;

  const out: ChatTurnRow[] = [];
  for (const r of rows) {
    const specs = Array.isArray(r.chart_specs) ? r.chart_specs : [];
    const charts: RenderedChartData[] = [];
    for (const spec of specs) {
      try {
        // Re-render: keep charts in sync with today's data.
        charts.push(await tool_make_chart(userId, spec as Parameters<typeof tool_make_chart>[1]));
      } catch {
        // Skip a chart we can't re-render; the answer text still stands.
      }
    }
    out.push({
      id: r.id,
      question: r.question,
      answer: r.answer_text ?? '',
      charts,
      cost_usd: Number(r.cost_usd) || 0,
      duration_ms: r.duration_ms,
    });
  }
  return out;
}
