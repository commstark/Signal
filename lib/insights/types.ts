// Shared types for the weekly insights pipeline.
//
// Lifecycle:
//   1. aggregateUserData()        -> UserDataBundle
//   2. computeCandidates(bundle)  -> Candidate[]  (deterministic, no LLM)
//   3. narrateInsights(candidates, bundle) -> NarratedInsight[] (Sonnet)
//   4. persist + push notify

export type InsightKind =
  | 'correlation'
  | 'group_compare'
  | 'intervention_window'
  | 'adherence_outcome';

// Output of the deterministic candidate phase — pure math, no narration.
export interface Candidate {
  kind: InsightKind;
  domains: string[]; // e.g., ['workout','mood'] or ['supplement','workout']
  metrics: CandidateMetrics;
  evidence: CandidateEvidence;
  // Effect-size signal the narrator can rank against. Higher = stronger.
  strength: number;
}

export type CandidateMetrics =
  | CorrelationMetrics
  | GroupCompareMetrics
  | InterventionWindowMetrics
  | AdherenceOutcomeMetrics;

export interface CorrelationMetrics {
  kind: 'correlation';
  metric_a: string; // e.g. 'dinner_carbs_g'
  metric_b: string; // e.g. 'next_day_energy'
  lag_days: number;
  n: number;
  pearson_r: number;
  window: { start: string; end: string };
}

export interface GroupCompareMetrics {
  kind: 'group_compare';
  group_var: string; // e.g. 'workout_muscle_group'
  outcome: string; // e.g. 'mood_score'
  groups: Record<string, { mean: number; sd: number; n: number }>;
  delta: number; // mean(top) - mean(bottom)
  cohens_d: number;
  window: { start: string; end: string };
}

export interface InterventionWindowMetrics {
  kind: 'intervention_window';
  intervention_name: string;
  direction: 'start' | 'stop';
  start_date: string;
  outcome: string;
  pre: { mean: number; sd: number; n: number; window_days: number };
  post: { mean: number; sd: number; n: number; window_days: number };
  delta: number;
  pct_change: number;
}

export interface AdherenceOutcomeMetrics {
  kind: 'adherence_outcome';
  intervention_name: string;
  outcome: string;
  high_adherence: { mean: number; sd: number; n_weeks: number };
  low_adherence: { mean: number; sd: number; n_weeks: number };
  delta: number;
  cohens_d: number;
}

// Raw datapoints behind each candidate — the dashboard can render these
// as scatter/dotplot/before-after evidence.
export interface CandidateEvidence {
  // For correlation: paired (x, y, date) triples
  // For group_compare: { group: string; value: number; date: string }
  // For intervention_window: { date: string; value: number; phase: 'pre'|'post' }
  // For adherence_outcome: { week_start: string; adherence: number; outcome: number }
  // Bag of points; shape depends on kind.
  points: Array<Record<string, unknown>>;
  // Anything else useful for the narrator (e.g. confounds it should flag).
  notes?: string[];
}

// What the LLM writes on top of a Candidate.
export interface NarratedInsight {
  candidate_index: number; // into the input candidates[] array
  headline: string; // <=140 chars, action-flavored where possible
  why_it_matters: string; // <=200 chars, one-sentence implication
  caveats: string[]; // confounds, low-n flags, seasonality, etc.
  surprise_score: number; // 0..1, higher = more surprising
}

// Data the narrator AND the candidate computers need.
export interface UserDataBundle {
  user_id: string;
  window: { start: string; end: string }; // last 7d
  long_window: { start: string; end: string }; // 8-12 weeks back
  // Recent week, full detail.
  recent_entries: RecentEntry[];
  recent_food_items: RecentFoodItem[];
  recent_workouts: RecentWorkoutExercise[];
  recent_supplements: RecentSupplementLog[];
  // 8-12wk aggregated, lighter shape.
  daily_aggregates: DailyAggregate[];
  // Active interventions with their start/stop dates.
  interventions: InterventionRow[];
  // The big rarely-changing context block sent to Sonnet (cache-friendly).
  profile_md: string | null;
  medical_docs_text: string | null;
  // Recent feedback for prompt personalization.
  recent_feedback: Array<{
    headline: string;
    verdict: 'up' | 'down' | 'wrong';
    note: string | null;
  }>;
}

export interface RecentEntry {
  id: string;
  occurred_at: string;
  intent: string;
  transcript: string;
}

export interface RecentFoodItem {
  occurred_at: string;
  name: string;
  protein_g: number | null;
  calories_kcal: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
}

export interface RecentWorkoutExercise {
  occurred_at: string;
  exercise_name: string;
  muscle_group: string | null;
  exercise_type: string | null;
  top_weight_lb: number | null;
  top_reps: number | null;
  total_duration_s: number | null;
}

export interface RecentSupplementLog {
  occurred_at: string;
  supplement_name: string;
  taken: boolean;
}

export interface DailyAggregate {
  date: string; // YYYY-MM-DD in PST
  protein_g: number;
  calories_kcal: number;
  carbs_g: number;
  fiber_g: number;
  sugar_g: number;
  water_ml: number;
  energy_score: number | null;
  mood_score: number | null;
  // Counts to detect adherence / activity days.
  workouts: number;
  supplement_takes: number;
  supplement_skips: number;
}

export interface InterventionRow {
  id: string;
  name: string;
  type: string;
  direction: 'start' | 'stop' | 'change';
  start_date: string;
  end_date: string | null;
  active: boolean;
}
