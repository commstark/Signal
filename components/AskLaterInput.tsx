'use client';

import { useState } from 'react';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function AskLaterInput() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const q = text.trim();
    if (!q) return;
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `save failed: ${res.status}`);
      }
      setText('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="w-full space-y-2">
      <label className="block text-micro text-ink-3 uppercase tracking-wide">
        ask later · a question to remember
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="e.g. did my sleep improve since starting magnesium?"
        className="w-full p-3 bg-surface border border-line rounded text-body focus:border-ink focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={status === 'saving' || !text.trim()}
          className="h-9 px-4 border border-line rounded text-small disabled:opacity-40"
        >
          {status === 'saving' ? 'saving…' : 'save'}
        </button>
        {status === 'saved' && (
          <span className="text-micro text-ink-3 font-mono">saved</span>
        )}
        {status === 'error' && error && (
          <span className="text-micro text-signal-red font-mono">{error}</span>
        )}
        <span className="text-micro text-ink-3 font-mono ml-auto">⌘↵ to save</span>
      </div>
    </div>
  );
}
