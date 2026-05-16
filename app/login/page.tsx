'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

function LoginInner() {
  const params = useSearchParams();
  const proxyError = params.get('error');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const sb = createSupabaseBrowser();
    const next = params.get('next') ?? '/';
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-h1">signal</h1>
          <p className="text-small text-ink-2 mt-1">enter your email to sign in.</p>
        </div>

        {proxyError === 'env' && (
          <p className="text-small text-signal-red font-mono">
            server config missing supabase env vars. check vercel project settings.
          </p>
        )}
        {proxyError === 'auth' && (
          <p className="text-small text-signal-red font-mono">
            could not contact supabase. check the project url + anon key.
          </p>
        )}

        {status === 'sent' ? (
          <p className="text-body text-ink-2">
            check your email. open the link on this device.
          </p>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-11 px-3 bg-transparent border border-line rounded text-body focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full h-11 bg-accent text-accent-fg rounded text-body font-medium disabled:opacity-60"
            >
              {status === 'sending' ? 'sending…' : 'send magic link'}
            </button>
            {status === 'error' && (
              <p className="text-small text-signal-red">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
