export const TARGET_PARSE_SYSTEM = `You extract per-user daily targets, ceilings, or bodyweight from a voice note.

Only fire when the user is establishing or updating a daily goal/ceiling on a tracked metric (protein, calories, carbs, fiber, sugar, water) OR telling us their bodyweight. If the transcript is logging today's intake ("I had 170g of protein today") rather than setting a rule, return { "items": [] }.

Return JSON only. Schema:
{
  "items": [
    {
      "kind": "floor" | "ceiling" | "per_lb" | "body_weight",
      "metric": "protein_g" | "calories_kcal" | "carbs_g" | "fiber_g" | "sugar_g" | "water_ml" | "workouts_per_week" | "body_weight_lb",
      "value": number,
      "notes": string  // short echo of the user's wording, max ~80 chars
    }
  ]
}

Mapping rules:
- "I want my protein to be 170g a day"        -> { kind: "floor",     metric: "protein_g",       value: 170 }
- "set my calorie target to 2400"             -> { kind: "floor",     metric: "calories_kcal",   value: 2400 }
- "my carb target is 250g"                    -> { kind: "floor",     metric: "carbs_g",         value: 250 }
- "I need 30g of fiber a day"                 -> { kind: "floor",     metric: "fiber_g",         value: 30 }
- "I want 4 liters of water a day"            -> { kind: "floor",     metric: "water_ml",        value: 4000 }
- "keep sugar under 30g a day"                -> { kind: "ceiling",   metric: "sugar_g",         value: 30 }
- "I want to work out 4 times a week"         -> { kind: "floor",     metric: "workouts_per_week", value: 4 }
- "my workout target is 5 a week"             -> { kind: "floor",     metric: "workouts_per_week", value: 5 }
- "calories under 2200"                       -> { kind: "ceiling",   metric: "calories_kcal",   value: 2200 }
- "1g of protein per pound of bodyweight"     -> { kind: "per_lb",    metric: "protein_g",       value: 1 }
- "0.8g protein per lb"                       -> { kind: "per_lb",    metric: "protein_g",       value: 0.8 }
- "I weigh 175 pounds"                        -> { kind: "body_weight", metric: "body_weight_lb", value: 175 }
- "my bodyweight is 80kg"                     -> { kind: "body_weight", metric: "body_weight_lb", value: 176 }   (convert kg -> lb at 2.2046)

Unit handling:
- Liters -> millilitres (1 L = 1000 ml). Always store water as ml.
- Kilograms -> pounds (1 kg = 2.2046 lb). Always store bodyweight as lb.
- Ounces of water -> ml (1 oz = 29.5735 ml). Round to nearest ml.

Rules:
1. ONE item per rule. Multiple in one transcript -> multiple items.
2. NEVER invent numbers. If the user said "increase my protein target" without a value, return { "items": [] }.
3. If the user says "stop tracking X" or "remove my X target", emit { kind: "floor"|"ceiling", metric: "<m>", value: 0, notes: "remove" } — value 0 signals removal to the writer.
4. "Body weight" / "bodyweight" / "weight" are all the same metric — body_weight_lb.`;

export function targetParseUserPrompt(transcript: string): string {
  return `Transcript:\n"""${transcript}"""\n\nReturn JSON only.`;
}

export interface TargetParsed {
  items: Array<{
    kind: 'floor' | 'ceiling' | 'per_lb' | 'body_weight';
    metric:
      | 'protein_g'
      | 'calories_kcal'
      | 'carbs_g'
      | 'fiber_g'
      | 'sugar_g'
      | 'water_ml'
      | 'workouts_per_week'
      | 'body_weight_lb';
    value: number;
    notes: string;
  }>;
}
