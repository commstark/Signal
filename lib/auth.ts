import { createSupabaseServer } from './supabase/server';

export async function requireUser() {
  const sb = await createSupabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Response('Unauthorized', { status: 401 });
  return data.user;
}
