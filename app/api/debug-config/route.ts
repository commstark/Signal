import { NextResponse } from 'next/server';

// Lightweight diagnostic: confirms what NEXT_PUBLIC_SUPABASE_URL Vercel
// actually baked into this deployment. Public-safe — the URL is already
// public anyway via the client bundle. Remove once setup is stable.
export const dynamic = 'force-dynamic';

export async function GET() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  return NextResponse.json({
    supabase_url_raw: raw,
    supabase_url_has_path: raw ? /\/(rest|auth)\/v1/.test(raw) : null,
    supabase_url_has_trailing_slash: raw ? raw.endsWith('/') : null,
    anon_key_present: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service_role_key_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    anthropic_key_present: !!process.env.ANTHROPIC_API_KEY,
    openai_key_present: !!process.env.OPENAI_API_KEY,
  });
}
