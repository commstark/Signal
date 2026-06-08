import type { TodayViewData } from '@/components/TodayView';

// The single spoken example the first-run tour "logs":
export const DEMO_LINE =
  'Two scoops of whey, a big glass of water, turkey sandwich for lunch, and I benched 225 for six.';

// A coherent demo day derived from DEMO_LINE. Rendered by the REAL /today
// components (no fake screen) and written to NOTHING — it only exists for
// the guided tour, keyed off ?tour=1. Timestamps are computed at request
// time so they always read as "today".
export function demoTodayData(): TodayViewData {
  const now = Date.now();
  const lunch = new Date(now - 2 * 60 * 60_000).toISOString();
  const workout = new Date(now - 1 * 60 * 60_000).toISOString();

  return {
    today: {
      protein_g: 76,
      calories_kcal: 720,
      fiber_g: 4,
      water_ml: 500,
      water_l: 0.5,
      sugar_g: 6,
      added_sugars_g: 2,
      carbs_g: 54,
      energy_avg: null,
      energy_descriptor: null,
      mood_avg: null,
      sleep_score: 4,
      sleep_descriptor: 'good',
      sleep_hours: 7.5,
      entry_count: 1,
    },
    breakdown: [
      {
        key: 'demo-whey',
        occurred_at: lunch,
        name: 'whey protein · 2 scoops',
        protein_g: 50,
        calories_kcal: 240,
        fiber_g: 1,
        water_ml: null,
        sugar_g: 3,
        added_sugars_g: 2,
        carbs_g: 8,
      },
      {
        key: 'demo-sandwich',
        occurred_at: lunch,
        name: 'turkey sandwich',
        protein_g: 26,
        calories_kcal: 480,
        fiber_g: 3,
        water_ml: null,
        sugar_g: 3,
        added_sugars_g: 0,
        carbs_g: 46,
      },
      {
        key: 'demo-water',
        occurred_at: lunch,
        name: 'water · a big glass',
        protein_g: null,
        calories_kcal: null,
        fiber_g: null,
        water_ml: 500,
        sugar_g: null,
        added_sugars_g: null,
        carbs_g: null,
      },
    ],
    entries: [
      {
        id: 'demo-entry',
        occurred_at: lunch,
        intent: 'mixed',
        transcript: DEMO_LINE,
        parse_status: 'ok',
        parse_warnings: null,
      },
    ],
    workouts: {
      session_count: 1,
      total_minutes: null,
      exercises: [
        {
          exercise_name: 'bench press',
          muscle_group: 'chest',
          exercise_type: 'strength',
          occurred_at: workout,
          set_count: 1,
          top_set: { weight_lb: 225, reps: 6 },
          total_duration_s: null,
          set_durations_s: null,
        },
      ],
    },
    supplements: { morning: [], day: [], night: [], unmatched: [] },
  };
}
