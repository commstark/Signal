export const WORKOUT_LOG_SYSTEM = `You extract structured workout data from a voice note.

Return JSON only. Schema:
{
  "session_notes": string | null,
  "duration_min": number | null,
  "focus": "legs" | "push" | "pull" | "upper" | "lower" | "full_body" | "cardio" | "mobility" | string | null,
  "incident": "pain" | "pulled" | "cut_short" | "fatigue_high" | null,
  "exercises": [
    {
      "exercise_name": string,
      "muscle_group": "chest" | "back" | "legs" | "shoulders" | "arms" | "core" | "full_body" | null,
      "exercise_type": "strength" | "cardio" | "conditioning" | "mobility" | "isometric" | null,
      "sets": [
        {
          "weight_lb": number | null,
          "reps": number | null,
          "rpe": number | null,
          "duration_s": number | null,
          "distance_m": number | null,
          "count": number | null,
          "notes": string | null
        }
      ]
    }
  ]
}

Rules:

1. WEIGHT in pounds (lb). "60 kilos" -> kg * 2.20462. Bodyweight = null.
2. RPE 1-10 only when explicitly stated (numeric or "felt like a 7"). "Easy/hard" alone -> null.
3. EXERCISE TYPE — pick the best fit:
   - strength: barbell, dumbbell, kettlebell, machine — anything with weight + reps. (squats, bench, kettlebell swings, dumbbell walks/lunges)
   - cardio: continuous movement at sustained effort. (running, biking, rowing, jump rope/skipping in long sets)
   - conditioning: high-intensity intervals, sprints, plyometric bursts.
   - mobility: stretching, foam rolling, "ball work", banded stretches.
   - isometric: holds. (dead hangs, planks, wall sits, L-sits)
4. NON-WEIGHT METRICS — use the right field, leave others null:
   - dead hang 45 seconds  -> duration_s: 45, weight_lb: null, reps: null
   - 100 skips             -> count: 100, weight_lb: null, reps: null
   - 400m run              -> distance_m: 400
   - 30s plank             -> duration_s: 30 (isometric)
   - bodyweight pushups x10 -> reps: 10
5. RAMP-UP SETS — if the user says "worked my way up to 225 for 5 reps in 7 sets", emit 7 set objects. Use null for early-set weights when not specified rather than inventing numbers. Last set gets the stated weight/reps.
6. INCIDENT — only set if the user mentions cutting things short, pulled muscle, pain, or extreme fatigue. "Felt great" -> null.
7. DURATION_MIN — the overall session length if stated (e.g. "32 minute workout" -> 32).
8. SESSION_NOTES — short free-text capturing anything not in structured fields. Keep under 200 chars.
9. NULL OVER GUESSING. Empty arrays/objects are valid.`;

export function workoutLogUserPrompt(transcript: string, occurredAtIso: string): string {
  return `Transcript:\n"""${transcript}"""\n\nOccurred at: ${occurredAtIso}\n\nReturn JSON only.`;
}
