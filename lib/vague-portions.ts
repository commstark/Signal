import type { HealthLogParsed, UserCalibrations } from './types';

// Container / measure words a user often says without a real quantity.
// We nudge them to calibrate these once ("a glass is 295ml") so future
// logs resolve precisely against lib/preferences.
const CONTAINER_TERMS = [
  'glass',
  'cup',
  'bowl',
  'plate',
  'scoop',
  'handful',
  'serving',
  'slice',
  'piece',
  'chunk',
  'palm',
  'fist',
  'bottle',
  'mug',
  'can',
];

const QUALITATIVE = /\b(some|a bit|a little|a lot|lots|couple|few|bunch|several)\b/;
const NUMERIC = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b/;

export interface VaguePortionHint {
  // The calibratable term — a container word ('glass') or, for purely
  // qualitative portions, the food itself ('rice').
  term: string;
  // What the user actually said, echoed back in the hint ('a big glass').
  phrase: string;
}

// A portion is "vague" when it names a container/measure or is purely
// qualitative AND carries no concrete number. Returns the calibratable
// terms the user has NOT already pinned down via a saved preference, so
// the hint keeps surfacing until they set one.
export function detectVaguePortions(
  parsed: Pick<HealthLogParsed, 'food_items'>,
  calibrations: UserCalibrations,
): VaguePortionHint[] {
  const calKeys = Object.keys(calibrations).join(' ').toLowerCase();
  const calNotes = Object.values(calibrations)
    .map((c) => (c.notes ?? '').toLowerCase())
    .join(' ');

  const seen = new Set<string>();
  const hints: VaguePortionHint[] = [];

  for (const item of parsed.food_items ?? []) {
    const phrase = (item.portion ?? '').trim();
    const portion = phrase.toLowerCase();
    if (!portion || NUMERIC.test(portion)) continue;

    const container = CONTAINER_TERMS.find((t) => new RegExp(`\\b${t}s?\\b`).test(portion));
    let term: string | null = null;
    if (container) {
      term = container;
    } else if (QUALITATIVE.test(portion)) {
      // "some rice" -> calibrate the food itself ("a serving of rice").
      term = (item.name ?? '').trim().toLowerCase().split(/\s+/).pop() || null;
    }
    if (!term || seen.has(term)) continue;

    // Already calibrated? Keys look like cup_volume_ml / rice_serving_g,
    // and notes echo the user's wording — a loose contains match covers both.
    if (calKeys.includes(term) || calNotes.includes(term)) continue;

    seen.add(term);
    hints.push({ term, phrase });
  }
  return hints;
}
