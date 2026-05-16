// Defensive helper: people commonly paste the Supabase REST endpoint
// (e.g. https://xxx.supabase.co/rest/v1/) into NEXT_PUBLIC_SUPABASE_URL,
// which makes supabase-js build URLs like
// https://xxx.supabase.co/rest/v1/auth/v1/otp and fail with "Invalid path
// specified in request URL". Normalize once, here.
export function supabaseProjectUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1.*$/, '')
    .replace(/\/auth\/v1.*$/, '');
}

export function supabaseAnonKey(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!raw) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return raw.trim();
}
