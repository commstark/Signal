// Shapes returned by the LLM parsers. Mirror the prompts in lib/prompts/*.

export interface HealthLogParsed {
  food_items: Array<{
    name: string;
    canonical_tag: string | null;
    portion: string | null;
    notes: string | null;
    // Per-item nutrient attribution. Sum across items should match the
    // entry's estimated_nutrition / water_ml totals.
    protein_g: number | null;
    calories_kcal: number | null;
    fiber_g: number | null;
    water_ml: number | null;
  }>;
  estimated_nutrition: {
    calories_kcal: number | null;
    protein_g: number | null;
    fiber_g: number | null;
    added_sugars_g: number | null;
    saturated_fat_present: boolean | null;
    carb_timing: 'morning' | 'midday' | 'evening' | 'late_night' | null;
    ultra_processed: boolean | null;
    confidence: 'high' | 'medium' | 'low';
  };
  water_ml: number | null;
  mood: { score: number | null; descriptor: string | null };
  fullness: 'hungry' | 'satisfied' | 'full' | 'stuffed' | null;
  energy: { score: number | null; descriptor: string | null };
  concentration: { score: number | null; descriptor: string | null };
  symptoms: string[];
  free_text_notes: string | null;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'full_body';

export type ExerciseType =
  | 'strength'
  | 'cardio'
  | 'conditioning'
  | 'mobility'
  | 'isometric';

export interface WorkoutLogParsed {
  session_notes: string | null;
  duration_min?: number | null;
  focus?: string | null;
  incident?: 'pain' | 'pulled' | 'cut_short' | 'fatigue_high' | null;
  exercises: Array<{
    exercise_name: string;
    muscle_group: MuscleGroup | null;
    exercise_type?: ExerciseType | null;
    sets: Array<{
      weight_lb: number | null;
      reps: number | null;
      rpe: number | null;
      duration_s?: number | null;
      distance_m?: number | null;
      count?: number | null;
      notes: string | null;
    }>;
  }>;
}

export interface SupplementLogParsed {
  logs: Array<{
    supplement_id: string | null;
    supplement_name: string;
    taken: boolean;
    notes: string | null;
  }>;
  candidate_intervention: null | {
    name: string;
    dose: string | null;
    timing: string | null;
    reason: string;
  };
}

export interface InterventionParsed {
  name: string;
  type: 'supplement' | 'food' | 'behavior' | 'exercise' | 'other';
  direction: 'start' | 'stop' | 'change';
  expected_window_days: number;
  notes: string | null;
}
