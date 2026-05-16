import { createClient } from '@supabase/supabase-js';
import { supabaseProjectUrl } from './url';

// Service-role client. Use only in route handlers and server-side jobs.
// Never import from a client component.
export function createSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(supabaseProjectUrl(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
