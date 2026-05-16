export const WORKOUT_LOG_SYSTEM = `You extract structured workout data from a voice note.

Return JSON only. Schema:
{
  "session_notes": string | null,
  "exercises": [
    {
      "exercise_name": string,
      "muscle_group": "chest" | "back" | "legs" | "shoulders" | "arms" | "core" | "full_body" | null,
      "sets": [
        { "weight_lb": number | null, "reps": number | null, "rpe": number | null, "notes": string | null }
      ]
    }
  ]
}

Rules:

1. Weight is in pounds (lb). If user says "60 kilos", convert: kg * 2.20462.
2. Bodyweight movements (push-ups, pull-ups, etc.): weight_lb is null, reps are filled.
3. RPE 1-10 only when stated. "easy" alone doesn't imply a number. "felt like a 7" -> 7.
4. set notes: short fragments like "easy", "moderate", "biceps twinge".
5. If only an exercise is mentioned with no sets, return one set object with reps/weight null.
6. session_notes captures anything broader: warmup felt good, time of day, mood about the session.`;

export function workoutLogUserPrompt(transcript: string, occurredAtIso: string): string {
  return `Transcript:\n"""${transcript}"""\n\nOccurred at: ${occurredAtIso}\n\nReturn JSON only.`;
}
