import { createBrowserClient } from '@supabase/ssr';
import { supabaseProjectUrl, supabaseAnonKey } from './url';

export function createSupabaseBrowser() {
  return createBrowserClient(supabaseProjectUrl(), supabaseAnonKey());
}
