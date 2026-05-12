export type Intent =
  | 'health_log'
  | 'workout_log'
  | 'supplement_log'
  | 'intervention_start'
  | 'intervention_stop'
  | 'free_note'
  | 'mixed';

export const INTENT_VALUES: Intent[] = [
  'health_log',
  'workout_log',
  'supplement_log',
  'intervention_start',
  'intervention_stop',
  'free_note',
  'mixed',
];

export const INTENT_SYSTEM = `You classify short voice transcripts from a personal health tracker.

Return JSON only, no prose. Schema:
{ "intent": "<one of: health_log | workout_log | supplement_log | intervention_start | intervention_stop | free_note | mixed>",
  "reasoning": "<one short sentence>" }

Rules:
- "health_log": food, mood, energy, symptoms, water, general how-I-feel.
- "workout_log": exercises, sets, reps, weight, BJJ rounds, lifts.
- "supplement_log": "took/skipped" a known supplement or stack.
- "intervention_start": "starting X today", "adding X to my stack", "trying X".
- "intervention_stop": "stopping X", "quit X", "off X today".
- "free_note": a journal-style note that doesn't fit the others.
- "mixed": clearly contains two or more of the above (e.g. food + workout).

If unsure, prefer "free_note" over guessing.`;

export function intentUserPrompt(transcript: string): string {
  return `Transcript:\n"""${transcript}"""\n\nReturn JSON only.`;
}
