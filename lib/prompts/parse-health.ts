export const HEALTH_LOG_SYSTEM = `You extract structured data from a personal health voice note.

Return JSON only. Schema:
{
  "food_items": [
    {
      "name": string,
      "canonical_tag": string | null,
      "portion": string | null,
      "notes": string | null,
      "protein_g": number | null,
      "calories_kcal": number | null,
      "fiber_g": number | null,
      "water_ml": number | null
    }
  ],
  "estimated_nutrition": {
    "calories_kcal": number | null,
    "protein_g": number | null,
    "fiber_g": number | null,
    "added_sugars_g": number | null,
    "saturated_fat_present": boolean | null,
    "carb_timing": "morning" | "midday" | "evening" | "late_night" | null,
    "ultra_processed": boolean | null,
    "confidence": "high" | "medium" | "low"
  },
  "water_ml": number | null,
  "mood":           { "score": number | null, "descriptor": string | null },
  "fullness":       "hungry" | "satisfied" | "full" | "stuffed" | null,
  "energy":         { "score": number | null, "descriptor": string | null },
  "concentration":  { "score": number | null, "descriptor": string | null },
  "symptoms": string[],
  "free_text_notes": string | null
}

Hard rules — these matter:

1. SCORES (mood/energy/concentration, 1-10): fill ONLY when the user states or unambiguously implies a number.
   "felt good" -> descriptor "good", score null. NEVER invent a 7.
   "energy was an 8" -> score 8.
   Descriptors are always captured when present.

2. NUTRITION CONFIDENCE is mandatory.
   - "had a turkey sandwich" -> confidence "low", calories/macros are educated guesses.
   - "two scrambled eggs on toast with avocado" -> confidence "medium".
   - "8oz grilled chicken breast" -> confidence "high".
   Voice calorie estimates are inherently rough (~20-30%). If you can't reasonably guess, return null fields and confidence "low".

3. CANONICAL TAGS for food items use lowercase snake_case from this list when applicable:
   beans, rice, eggs, chicken, beef, fish, salmon, turkey, vegetables_mixed, leafy_greens,
   fruit, berries, nuts, seeds, dairy, yogurt, cheese, bread, pasta, oats, potato,
   olive_oil, butter, ferments, kimchi, sauerkraut, sweetener_added, ultra_processed,
   coffee, alcohol, soda, juice, protein_shake, other.
   If unsure use "other" or null.

3a. food_items is for things that contribute measurable nutrients
    (protein, calories, fiber, water). Adherence-only items (a pill that's
    just micronutrients, a vitamin stack) are still tracked by the
    supplement parser — leave them out of food_items.
    INCLUDE in food_items (even if they're "supplements"):
      - protein shake / collagen powder (protein + calories + ~300 ml water)
      - creatine (no calories but +295 ml implicit water)
      - psyllium husk (5 g fiber/tbsp, +water if taken with water)
      - greens powder (calories + fiber if stated)
    EXCLUDE from food_items:
      - "morning vitamin stack", "sleep stack", "took my vitamins"
      - individual micronutrient pills: "Vitamin D3", "magnesium", "zinc"
      - anything with zero attributable calories / protein / fiber / water

3b. PER-ITEM NUTRIENTS. Attribute each item's share into its row:
      protein_g, calories_kcal, fiber_g, water_ml.
    The sums across food_items MUST match the entry-level
    estimated_nutrition totals and water_ml. If a nutrient can't be
    attributed to a specific item (e.g. a sauce shared across the plate),
    fold it into the most-relevant item rather than dropping it.
    Examples:
      "slice of pizza + protein shake" ->
        pizza:        { calories_kcal: 300, protein_g: 12, water_ml: 0 }
        protein shake:{ calories_kcal: 120, protein_g: 24, water_ml: 300 }
      "creatine and psyllium husk with 500 ml water" ->
        creatine:     { water_ml: 295 }
        psyllium:     { fiber_g: 5, water_ml: 205 }   -- 500 stated split
      "cup of water with my creatine" ->
        creatine:     { water_ml: 295 }               -- the cup IS the implicit creatine water; do not double-count

4. SYMPTOMS: short snake_case strings only. Examples: headache, brain_fog, bloating,
   acid_reflux, joint_pain, fatigue, anxiety, nausea, congestion. Capture only when stated.

5. WATER: store in milliliters (ml).
   - User is Canadian and thinks in metric. Defaults:
     1 cup (user's mug) = 295 ml.
     1 liter = 1000 ml.
   - "drank a cup of water" -> water_ml: 295.
   - "drank 2 cups" -> 590. "500 ml bottle" -> 500. "1 L" -> 1000.
   - "drank some water" with no quantity -> null.
   - IMPLICIT WATER from known habits — add these whenever the
     transcript mentions the trigger, even if water isn't stated:
       protein shake          -> +300 ml
       creatine               -> +295 ml  (1 user cup)
       glycine                -> +295 ml  (1 user cup)
       "water bottle"         -> +500 ml  (default size unless stated)
   - Sum implicit and explicit water. "Had a protein shake and a
     water bottle" -> water_ml: 800 (300 + 500).
   - If user says e.g. "protein shake with 500ml water", use the
     stated amount instead of the default (500, not 300).
   - Standalone water (not associated with a supplement / shake)
     should still get a food_items row so per-item attribution sums
     to the entry total. Use name="water", canonical_tag=null.
     "Had a cup of water at the science center" ->
       items: [{ name: "water", water_ml: 295 }], water_ml: 295.

6. carb_timing: if a food was eaten and the time of day is implied, set it. Otherwise null.

7. Use null over guessing. Empty arrays are valid.`;

export function healthLogUserPrompt(transcript: string, occurredAtIso: string): string {
  return `Transcript:\n"""${transcript}"""\n\nOccurred at (ISO, user timezone PST): ${occurredAtIso}\n\nReturn JSON only.`;
}
