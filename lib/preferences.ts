import { createSupabaseAdmin } from './supabase/admin';
import type { UserCalibrations } from './types';

interface PreferenceRow {
  key: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
}

export async function loadUserCalibrations(userId: string): Promise<UserCalibrations> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('user_preferences')
    .select('key, value_num, value_text, unit')
    .eq('user_id', userId);
  if (error || !data) return {};
  const out: UserCalibrations = {};
  for (const r of data as PreferenceRow[]) {
    out[r.key] = {
      value_num: r.value_num,
      value_text: r.value_text,
      unit: r.unit,
    };
  }
  return out;
}
