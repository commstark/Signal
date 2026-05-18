'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Persona } from '@/lib/personas';

type Window = 'today' | '7d' | '30d';

interface Props {
  personas: Persona[];
}

const WINDOWS: { value: Window; label: string }[] = [
  { value: 'today', label: 'today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

export function AskForm({ personas }: Props) {
  const [personaId, setPersonaId] = useState<string>(personas[0]?.id ?? '');
  const [window, setWindow] = useState<Window>('7d');
  const [question, setQuestion] = useState('');
  const [contextMd, setContextMd] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const persona = personas.find((p) => p.id === personaId) ?? null;

  // Refresh context whenever the window changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingContext(true);
    setContextError(null);
    fetch('/api/ask/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ window }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `context failed: ${res.status}`);
        }
        const { markdown } = (await res.json()) as { markdown: string };
        if (!cancelled) setContextMd(markdown);
      })
      .catch((e) => {
        if (!cancelled) setContextError(e instanceof Error ? e.message : 'failed');
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [window]);

  const assembledPrompt = useMemo(() => {
    if (!persona) return '';
    const parts = [persona.system_prompt.trim(), '---', contextMd.trim()];
    if (question.trim()) parts.push('---', `# Question`, question.trim());
    return parts.join('\n\n');
  }, [persona, contextMd, question]);

  async function onCopy() {
    if (!assembledPrompt) return;
    try {
      await navigator.clipboard.writeText(assembledPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the textarea so the user can ⌘C manually.
      const ta = document.getElementById('assembled-prompt') as HTMLTextAreaElement | null;
      ta?.select();
    }
  }

  if (!persona) {
    return <p className="text-body text-ink-2">no personas seeded. refresh the page.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-micro text-ink-3 uppercase tracking-wide">persona</label>
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          className="w-full h-10 bg-surface border border-line rounded px-3 text-body focus:border-ink focus:outline-none"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.description ? ` — ${p.description}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-micro text-ink-3 uppercase tracking-wide">context window</label>
        <div className="flex gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className={`h-9 px-3 rounded text-small border ${
                window === w.value
                  ? 'bg-ink text-bg border-ink'
                  : 'border-line text-ink-2 hover:text-ink'
              }`}
            >
              {w.label}
            </button>
          ))}
          {loadingContext && (
            <span className="text-micro text-ink-3 font-mono self-center ml-2">loading…</span>
          )}
          {contextError && (
            <span className="text-micro text-signal-red font-mono self-center ml-2">
              {contextError}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-micro text-ink-3 uppercase tracking-wide">question</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="e.g. how is my protein intake trending this week?"
          className="w-full p-3 bg-surface border border-line rounded text-body focus:border-ink focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="block text-micro text-ink-3 uppercase tracking-wide">
            assembled prompt
          </label>
          <button
            onClick={onCopy}
            disabled={!assembledPrompt}
            className="h-9 px-4 bg-accent text-accent-fg rounded text-small font-medium disabled:opacity-40"
          >
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <textarea
          id="assembled-prompt"
          readOnly
          value={assembledPrompt}
          rows={16}
          className="w-full p-3 bg-surface border border-line rounded text-small font-mono text-ink focus:border-ink focus:outline-none"
        />
        <p className="text-micro text-ink-3 font-mono">
          paste into chatgpt / claude. {assembledPrompt.length.toLocaleString()} chars.
        </p>
      </div>
    </div>
  );
}
