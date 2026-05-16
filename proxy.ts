import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/manifest.json') ||
    path.startsWith('/sw.js') ||
    path.startsWith('/icons') ||
    path.startsWith('/_next');

  // Public paths never need to consult Supabase. Return early so a missing
  // or broken Supabase configuration can't take down /login.
  if (isPublic) return NextResponse.next({ request: req });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing, send users to /login with a hint instead of crashing.
  if (!supabaseUrl || !supabaseKey) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'env');
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next({ request: req });

  try {
    const sb = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    });
    const { data } = await sb.auth.getUser();

    if (!data.user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }
  } catch (err) {
    console.error('proxy: supabase getUser failed', err);
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'auth');
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
