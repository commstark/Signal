// Synthetic Candidate[] inputs for the weekly-reflection narrator eval.
// Each fixture has hand-crafted stats and a list of traits the output
// MUST or MUST NOT exhibit. The judge prompt verifies the narration.

import type { Candidate, UserDataBundle } from '@/lib/insights/types';

export interface Fixture {
  name: string;
  candidates: Candidate[];
  partial_bundle: Pick<UserDataBundle, 'interventions' | 'profile_md' | 'recent_feedback' | 'window' | 'long_window'>;
  expected: {
    // Substrings the narration MUST contain (case-insensitive).
    must_mention?: string[];
    // Substrings the narration MUST NOT contain (case-insensitive) —
    // catches fabricated stats or known-obvious patterns.
    must_not_mention?: string[];
    // Min insights count.
    min_insights?: number;
    // Max insights count.
    max_insights?: number;
    // Any insight referencing an intervention MUST have a caveat about
    // overlapping interventions in the same window.
    require_overlap_caveat?: boolean;
  };
}

const WINDOW = { start: '2026-05-23', end: '2026-05-30' };
const LONG = { start: '2026-03-08', end: '2026-05-30' };

export const FIXTURES: Fixture[] = [
  {
    name: 'clear intervention win',
    candidates: [
      {
        kind: 'intervention_window',
        domains: ['intervention', 'workout'],
        strength: 0.09,
        metrics: {
          kind: 'intervention_window',
          intervention_name: 'creatine',
          direction: 'start',
          start_date: '2026-05-01',
          outcome: 'workouts',
          pre: { mean: 3.2, sd: 1.1, n: 14, window_days: 28 },
          post: { mean: 4.1, sd: 1.0, n: 14, window_days: 28 },
          delta: 0.9,
          pct_change: 0.28,
        },
        evidence: { points: [] },
      },
    ],
    partial_bundle: {
      window: WINDOW,
      long_window: LONG,
      interventions: [
        {
          id: 'a',
          name: 'creatine',
          type: 'supplement',
          direction: 'start',
          start_date: '2026-05-01',
          end_date: null,
          active: true,
        },
      ],
      profile_md: null,
      recent_feedback: [],
    },
    expected: {
      must_mention: ['creatine', '2026-05-01'],
      min_insights: 1,
      max_insights: 1,
    },
  },
  {
    name: 'overlapping interventions need caveat',
    candidates: [
      {
        kind: 'intervention_window',
        domains: ['intervention', 'energy'],
        strength: 0.14,
        metrics: {
          kind: 'intervention_window',
          intervention_name: 'creatine',
          direction: 'start',
          start_date: '2026-05-01',
          outcome: 'energy_score',
          pre: { mean: 6.0, sd: 1.2, n: 14, window_days: 28 },
          post: { mean: 6.9, sd: 1.0, n: 14, window_days: 28 },
          delta: 0.9,
          pct_change: 0.15,
        },
        evidence: { points: [] },
      },
    ],
    partial_bundle: {
      window: WINDOW,
      long_window: LONG,
      interventions: [
        {
          id: 'a',
          name: 'creatine',
          type: 'supplement',
          direction: 'start',
          start_date: '2026-05-01',
          end_date: null,
          active: true,
        },
        {
          id: 'b',
          name: 'magnesium glycinate',
          type: 'supplement',
          direction: 'start',
          start_date: '2026-05-07',
          end_date: null,
          active: true,
        },
      ],
      profile_md: null,
      recent_feedback: [],
    },
    expected: {
      must_mention: ['creatine'],
      min_insights: 1,
      require_overlap_caveat: true,
    },
  },
  {
    name: 'low-n correlation should be skipped or caveated',
    candidates: [
      {
        kind: 'correlation',
        domains: ['nutrition', 'energy'],
        strength: 0.34,
        metrics: {
          kind: 'correlation',
          metric_a: 'sugar_g',
          metric_b: 'energy_score',
          lag_days: 1,
          n: 16,
          pearson_r: -0.34,
          window: LONG,
        },
        evidence: { points: [] },
      },
      {
        kind: 'correlation',
        domains: ['nutrition', 'energy'],
        strength: 0.65,
        metrics: {
          kind: 'correlation',
          metric_a: 'protein_g',
          metric_b: 'energy_score',
          lag_days: 1,
          n: 60,
          pearson_r: 0.65,
          window: LONG,
        },
        evidence: { points: [] },
      },
    ],
    partial_bundle: {
      window: WINDOW,
      long_window: LONG,
      interventions: [],
      profile_md: '## Interests\n- Care about energy and workouts\n- Skip mood\n',
      recent_feedback: [],
    },
    expected: {
      // Stronger one should win out; correlation should label the lag.
      must_mention: ['protein', 'next-day'],
      max_insights: 2,
    },
  },
];
