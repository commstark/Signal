export type Intent =
  | 'health_log'
  | 'workout_log'
  | 'supplement_log'
  | 'intervention_start'
  | 'intervention_stop'
  | 'preference_set'
  | 'target_set'
  | 'free_note'
  | 'mixed';

export const INTENT_VALUES: Intent[] = [
  'health_log',
  'workout_log',
  'supplement_log',
  'intervention_start',
  'intervention_stop',
  'preference_set',
  'target_set',
  'free_note',
  'mixed',
];

export const INTENT_SYSTEM = `You classify short voice transcripts from a personal health tracker.

Return JSON only, no prose. Schema:
{ "intent": "<one of: health_log | workout_log | supplement_log | intervention_start | intervention_stop | preference_set | target_set | free_note | mixed>",
  "reasoning": "<one short sentence>" }

Rules:
- "health_log": food, mood, energy, symptoms, water, general how-I-feel.
- "workout_log": exercises, sets, reps, weight, BJJ rounds, lifts. ALSO
   any TRAINING ACTIVITY or CLASS even without explicit reps/weight:
   "jiu-jitsu class", "jujutsu", "BJJ", "judo", "wrestling", "boxing",
   "muay thai", "kickboxing", "MMA", "yoga", "pilates", "spin class",
   "soul cycle", "barre", "crossfit", "f45", "hot yoga", "swim", "ran 5k",
   "went for a run", "long walk", "hike", "rock climbing", "tennis",
   "basketball", "soccer", "skating", "surf session", "ski day".
   If the transcript names an activity like this, it IS a workout — even
   when the rest of the sentence is "good workout, felt tired" with no
   structured sets.
- "supplement_log": "took/skipped" a known supplement or stack — AND the
   transcript has no other content (no food, water, mood, etc.). Pills
   typically go down with a cup of water, so a bare "took my vitamins" or
   "took my morning/day/sleep stack" should be classified as "mixed"
   instead, so the health parser can credit the implicit water (and, for
   the day stack, the olive oil it includes). Only use "supplement_log"
   when neither water nor calories can apply (e.g. "I forgot to take my
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
- "target_set": the user is setting a DAILY GOAL or CEILING on a tracked
   metric (protein, calories, carbs, fiber, sugar, water), OR telling us
   their bodyweight (which feeds per-bodyweight target ratios). Signal
   phrases: "I want my X to be ...", "my X target is ...", "set my X to
   ...", "keep X under ...", "I weigh ...", "my bodyweight is ...".
   Examples that ARE target_set:
     "I want my protein to be 170g a day"        -> protein_g = 170
     "my carb target is 250g a day"               -> carbs_g = 250
     "my protein target is 1g per pound of bodyweight" -> protein_g_per_lb = 1
     "keep sugar under 30g a day"                 -> sugar_g_ceiling = 30
     "I weigh 175 pounds"                          -> body_weight_lb = 175
   Targets differ from preference_set: a preference defines what a UNIT
   means ("a cup is 295ml"); a target defines a DAILY AMOUNT to hit or
   stay under. If the transcript mixes both, prefer "mixed".
- "free_note": a journal-style note that doesn't fit the others.
- "mixed": clearly contains two or more of the above (e.g. food + workout).
   ALSO classify as "mixed" when the transcript mentions a protein shake
   (literal word "shake") OR an individual stack supplement explicitly
   ("vitamin C", "creatine", "magnesium", etc.). These imply BOTH a
   nutrition log (the shake/supplement has calories/protein and goes
   down with water) AND a supplement adherence log. Running both parsers
   is the only way the protein tile picks up shake/collagen and the
   adherence panel ticks correctly.
   IMPORTANT: a TRAINING ACTIVITY mentioned alongside ANY other content
   (water, food, supplements, mood) ALWAYS goes to "mixed", never to
   "health_log" — otherwise the workout never gets written. Example:
     "Jiu-jitsu class, good workout, full bottle of water and my creatine"
     -> "mixed" (workout + supplement + implicit water). NOT "health_log".
     "Played soccer, then had a chicken sandwich" -> "mixed".
     "Went for a 5k, felt great" -> "workout_log" (no food/supplement
     mentioned).

Default bias: treat a transcript as a one-off log unless it contains an
explicit rule-setting phrase. "I take vitamin E daily" without "from now
on" or similar is intervention_start, not preference_set.

If unsure, prefer "free_note" over guessing.`;

export function intentUserPrompt(transcript: string): string {
  return `Transcript:\n"""${transcript}"""\n\nReturn JSON only.`;
}
