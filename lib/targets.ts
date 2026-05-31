import { createSupabaseAdmin } from './supabase/admin';

// Daily targets used to fill the /today tiles. Floor metrics ("eat at
// least this much") fill with lilac as you approach 100%. Ceilings
// ("stay below this") fill with peach as you approach the ceiling.
// workouts_per_week is the only weekly-cadence target — drives the
// /signals workout goal chart.
export interface Targets {
  protein_g: number;
  calories_kcal: number;
  carbs_g: number;
  fiber_g: number;
  water_ml: number;
  sugar_g_ceiling: number;
  workouts_per_week: number;
}

const DEFAULT_TARGETS: Targets = {
  protein_g: 140,
  calories_kcal: 2200,
  carbs_g: 250,
  fiber_g: 25,
  water_ml: 3000,
  sugar_g_ceiling: 50,
  workouts_per_week: 4,
};

// Keys we accept as overrides in users.targets. Voice-set targets follow
// the same naming so /today tiles read straight through.
const FLOOR_KEYS: Array<keyof Targets> = [
  'protein_g',
  'calories_kcal',
  'carbs_g',
  'fiber_g',
  'water_ml',
  'workouts_per_week',
];

const PER_LB_KEYS = [
  'protein_g_per_lb',
  'calories_kcal_per_lb',
  'carbs_g_per_lb',
  'fiber_g_per_lb',
  'water_ml_per_lb',
] as const;
type PerLbKey = (typeof PER_LB_KEYS)[number];

function floorKeyFromPerLb(k: PerLbKey): keyof Targets {
  return k.replace(/_per_lb$/, '') as keyof Targets;
}

export async function loadUserTargets(userId: string): Promise<Targets> {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('users')
    .select('targets, body_weight_lb')
    .eq('id', userId)
    .maybeSingle();
  const raw = (data?.targets ?? {}) as Record<string, number>;
  const bodyWeight = data?.body_weight_lb as number | null | undefined;

  const cleaned: Partial<Targets> = {};

  // 1. Absolute floor overrides win first ("my protein target is 170g").
  for (const k of FLOOR_KEYS) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      cleaned[k] = v;
    }
  }
  if (
    typeof raw.sugar_g_ceiling === 'number' &&
    Number.isFinite(raw.sugar_g_ceiling) &&
    raw.sugar_g_ceiling > 0
  ) {
    cleaned.sugar_g_ceiling = raw.sugar_g_ceiling;
  }

  // 2. Per-bodyweight ratios fill in any floor that wasn't set absolutely,
  //    multiplying against the current body weight. So if you change your
  //    weight, the target follows without re-saying the rule.
  if (typeof bodyWeight === 'number' && Number.isFinite(bodyWeight) && bodyWeight > 0) {
    for (const perLbKey of PER_LB_KEYS) {
      const ratio = raw[perLbKey];
      if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0) continue;
      const floorKey = floorKeyFromPerLb(perLbKey);
      if (cleaned[floorKey] != null) continue; // absolute override wins
      cleaned[floorKey] = round(bodyWeight * ratio, 0);
    }
  }

  return { ...DEFAULT_TARGETS, ...cleaned };
}

function round(n: number, places: number): number {
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

export { DEFAULT_TARGETS };
