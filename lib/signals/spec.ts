// The JSON spec the model emits to draw a chart. Constrained to a
// handful of shapes the renderer knows about — keeps the surface tight
// and the LLM honest. No raw SVG, no arbitrary code.

export type ChartKind = 'line' | 'bar' | 'scatter' | 'group_compare';

// Metrics we know how to pull aggregates for. Mirror the daily aggregate
// columns + workout / supplement signals lib/signals/aggregate.ts builds.
export const METRIC_VALUES = [
  'protein_g',
  'calories_kcal',
  'carbs_g',
  'fiber_g',
  'sugar_g',
  'water_ml',
  'energy_score',
  'mood_score',
  'workouts',
  'workout_minutes',
  'supplement_takes',
  'supplement_skips',
  'supplement_adherence_pct',
] as const;
export type Metric = (typeof METRIC_VALUES)[number];

export type GroupBy = 'day_of_week' | 'workout_day' | 'muscle_group' | 'workout_type' | 'intervention_phase';

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  caption?: string;
  x: { metric: Metric; label?: string };
  y: { metric: Metric; label?: string };
  // For group_compare only.
  group_by?: GroupBy;
  // Window for the underlying query.
  window_days: number;
  // Same-day = 0, next-day = 1, etc.
  lag_days?: number;
  // Draw vertical reference lines at interventions.start_date within window.
  intervention_markers?: boolean;
}

export interface RenderedChartData {
  spec: ChartSpec;
  points: Array<Record<string, number | string | null>>;
  interventions?: Array<{ date: string; name: string }>;
}
