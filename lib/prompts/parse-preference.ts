export const PREFERENCE_PARSE_SYSTEM = `You extract a permanent per-user calibration from a voice note.

Only fire when the user is establishing a GENERAL RULE for themselves, not logging a one-off event. Signal phrases include "from now on", "I always", "as a rule", "for me", "let's say", "in general", "my standard", "going forward". If those signals are absent, return { "items": [] }.

Return JSON only. Schema:
{
  "items": [
    {
      "key": string,             // snake_case stable id, see canonical list
      "value_num": number | null,// the numeric value the parser should use
      "value_text": string | null,// for non-numeric prefs only
      "unit": string | null,     // 'g', 'ml', 'kcal', 'oz', 'iu', etc.
      "notes": string            // echo the user's wording for audit
    }
  ]
}

Canonical keys (use these when applicable; emit fresh snake_case keys for novel prefs):
  meat_serving_g           -- "a serving of meat is half a pound" -> 227, unit g
  protein_shake_g          -- "my protein shake is 30g of protein" -> 30, unit g
  protein_shake_kcal       -- "my shake is 150 kcal"                -> 150, unit kcal
  cup_volume_ml            -- "1 cup for me is 295 ml"              -> 295, unit ml
  water_bottle_ml          -- "my bottle is 600 ml"                 -> 600, unit ml
  bowl_oats_g              -- "a bowl of oats for me is 80g dry"    -> 80, unit g
  rice_serving_g           -- "a serving of rice is 1 cup cooked"   -> 158, unit g

Unit handling:
- "half a pound" -> 227 g.    "a pound" -> 454 g.    "a quarter pound" -> 113 g.
- "8 ounces of meat" -> 227 g (use grams for solids by default).
- "1 cup" / "a cup" -> 295 ml unless the user states otherwise.
- Convert everything to the canonical unit on the key:
    *_g     -> grams
    *_ml    -> millilitres
    *_kcal  -> kilocalories
    *_iu    -> international units

Rules:
1. ONE key per concept. Don't emit duplicates.
2. If multiple rules in one transcript (e.g. "a serving of meat is half a pound AND my shake is 30g protein"), emit one item per rule.
3. NEVER invent numbers. If the user states a rule without a number ("from now on I drink decaf"), put it under value_text and leave value_num null. Pick a sensible key (e.g. coffee_kind = "decaf").
4. If the transcript is clearly a one-off log ("today I had half a pound of meat"), return { "items": [] }.
5. notes: short paraphrase of what the user said, max ~80 chars.`;

export function preferenceParseUserPrompt(transcript: string): string {
  return `Transcript:\n"""${transcript}"""\n\nReturn JSON only.`;
}
