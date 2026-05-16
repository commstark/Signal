import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { supabaseProjectUrl, supabaseAnonKey } from '@/lib/supabase/url';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  const response = NextResponse.redirect(new URL(next, req.url));

  if (!code) return response;

  const sb = createServerClient(
    supabaseProjectUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('auth callback: exchangeCodeForSession failed', error);
    const errUrl = new URL('/login', req.url);
    errUrl.searchParams.set('error', 'auth');
    return NextResponse.redirect(errUrl);
  }

  return response;
}
