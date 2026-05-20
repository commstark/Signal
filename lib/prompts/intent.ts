export type Intent =
  | 'health_log'
  | 'workout_log'
  | 'supplement_log'
  | 'intervention_start'
  | 'intervention_stop'
  | 'preference_set'
  | 'free_note'
  | 'mixed';

export const INTENT_VALUES: Intent[] = [
  'health_log',
  'workout_log',
  'supplement_log',
  'intervention_start',
  'intervention_stop',
  'preference_set',
  'free_note',
  'mixed',
];

export const INTENT_SYSTEM = `You classify short voice transcripts from a personal health tracker.

Return JSON only, no prose. Schema:
{ "intent": "<one of: health_log | workout_log | supplement_log | intervention_start | intervention_stop | preference_set | free_note | mixed>",
  "reasoning": "<one short sentence>" }

Rules:
- "health_log": food, mood, energy, symptoms, water, general how-I-feel.
- "workout_log": exercises, sets, reps, weight, BJJ rounds, lifts.
- "supplement_log": "took/skipped" a known supplement or stack — AND the
   transcript has no other content (no food, water, mood, etc.). Pills
   typically go down with a cup of water, so a bare "took my vitamins"
   or "took my morning stack" should be classified as "mixed" instead so
   the health parser can credit the implicit water. Only use
   "supplement_log" when water can't apply (e.g. "I forgot to take my
   stack today", "skipped magnesium").
- "intervention_start": "starting X today", "adding X to my stack", "trying X".
- "intervention_stop": "stopping X", "quit X", "off X today".
- "preference_set": the user is establishing a PERMANENT personal rule —
   "from now on...", "I always...", "as a rule...", "for me, X is...",
   "let's say X is Y", "in general...", "my standard X is...",
   "going forward...". Examples that ARE preference_set:
     "from now on a serving of meat is half a pound"
     "for me a cup is 295 ml"
     "my protein shake is 24g of protein"
   Examples that are NOT preference_set (no rule-setting signal):
     "today I had half a pound of meat"      -> health_log
     "I had a cup of coffee"                  -> health_log
- "free_note": a journal-style note that doesn't fit the others.
- "mixed": clearly contains two or more of the above (e.g. food + workout).

Default bias: treat a transcript as a one-off log unless it contains an
explicit rule-setting phrase. "I take vitamin E daily" without "from now
on" or similar is intervention_start, not preference_set.

If unsure, prefer "free_note" over guessing.`;

export function intentUserPrompt(transcript: string): string {
  return `Transcript:\n"""${transcript}"""\n\nReturn JSON only.`;
}
