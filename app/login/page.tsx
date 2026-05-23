'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

function LoginInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [status, setStatus] = useState<'idle' | 'sending' | 'verifying' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    const sb = createSupabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStep('code');
      setStatus('idle');
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('verifying');
    setErrorMsg('');
    const sb = createSupabaseBrowser();
    const { error } = await sb.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      // Session cookies are now set; full navigation so server components
      // pick up the authenticated session.
      const next = params.get('next') ?? '/';
      window.location.assign(next);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-h1">signal</h1>
          <p className="text-small text-ink-2 mt-1">
            {step === 'email'
              ? 'enter your email to sign in.'
              : `enter the 6-digit code sent to ${email}.`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
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
              {status === 'sending' ? 'sending…' : 'send code'}
            </button>
            {status === 'error' && (
              <p className="text-small text-signal-red">{errorMsg}</p>
            )}
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="w-full h-11 px-3 bg-transparent border border-line rounded text-body tracking-[0.3em] focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === 'verifying'}
              className="w-full h-11 bg-accent text-accent-fg rounded text-body font-medium disabled:opacity-60"
            >
              {status === 'verifying' ? 'verifying…' : 'verify & sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setStatus('idle');
                setErrorMsg('');
              }}
              className="w-full text-small text-ink-2 underline"
            >
              use a different email
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
