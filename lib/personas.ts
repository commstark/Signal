import { createSupabaseAdmin } from './supabase/admin';
import { PERSONA_SEEDS } from './personas-seed';

export interface Persona {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  system_prompt: string;
  sort_order: number;
}

// Fetch personas for a user. If the user has none, insert the seed set
// (idempotent via unique(user_id, slug)) and re-fetch.
export async function getPersonasForUser(userId: string): Promise<Persona[]> {
  const sb = createSupabaseAdmin();

  const fetchAll = async () =>
    sb
      .from('personas')
      .select('id, slug, name, description, system_prompt, sort_order')
      .eq('user_id', userId)
      .eq('active', true)
      .order('sort_order', { ascending: true });

  const initial = await fetchAll();
  if (initial.data?.length) return initial.data as Persona[];

  // Seed once.
  const rows = PERSONA_SEEDS.map((p) => ({
    user_id: userId,
    slug: p.slug,
    name: p.name,
    description: p.description,
    system_prompt: p.system_prompt,
    sort_order: p.sort_order,
  }));
  await sb.from('personas').insert(rows);

  const seeded = await fetchAll();
  return (seeded.data as Persona[]) ?? [];
}
