import { createSupabaseAdmin } from './supabase/admin';

// Daily targets used to fill the /today tiles. Floor metrics ("eat at
// least this much") fill with lilac as you approach 100%. Ceilings
// ("stay below this") fill with peach as you approach the ceiling.
export interface Targets {
  protein_g: number;
  calories_kcal: number;
  carbs_g: number;
  fiber_g: number;
  water_ml: number;
  sugar_g_ceiling: number;
}

const DEFAULT_TARGETS: Targets = {
  protein_g: 140,
  calories_kcal: 2200,
  carbs_g: 250,
  fiber_g: 25,
  water_ml: 3000,
  sugar_g_ceiling: 50,
};

export async function loadUserTargets(userId: string): Promise<Targets> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('users').select('targets').eq('id', userId).maybeSingle();
  const overrides = (data?.targets ?? {}) as Partial<Targets>;
  // Only accept positive finite numbers as overrides; ignore anything else.
  const cleaned: Partial<Targets> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      cleaned[k as keyof Targets] = v;
    }
  }
  return { ...DEFAULT_TARGETS, ...cleaned };
}

export { DEFAULT_TARGETS };
