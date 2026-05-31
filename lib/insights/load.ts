import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { InsightKind, CandidateMetrics, CandidateEvidence } from './types';

export interface ActiveInsight {
  id: string;
  computed_at: string;
  kind: InsightKind;
  domains: string[];
  headline: string;
  why_it_matters: string | null;
  caveats: string[];
  surprise_score: number | null;
  metrics: CandidateMetrics;
  evidence: CandidateEvidence | null;
}

export async function fetchActiveInsights(userId: string): Promise<ActiveInsight[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('weekly_insights')
    .select(
      'id, computed_at, kind, domains, headline, why_it_matters, caveats, surprise_score, metrics, evidence',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('surprise_score', { ascending: false, nullsFirst: false })
    .order('computed_at', { ascending: false });
  return (data ?? []) as ActiveInsight[];
}
