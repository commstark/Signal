'use client';

import { useState, useRef } from 'react';
import type { RenderedChartData } from '@/lib/signals/spec';
import { SpecChart } from './SpecChart';

interface ChatTurn {
  id: string;
  question: string;
  answer: string;
  charts: RenderedChartData[];
  cost_usd?: number | null;
  duration_ms?: number | null;
}

const EXAMPLE_PROMPTS = [
  'Did dinner carbs predict next-day energy this month?',
  'Show me my protein the last 60 days.',
  'How am I doing on adherence vs four weeks ago?',
  'Did bench top set go up after creatine?',
];

export function AskPanel({ initialHistory }: { initialHistory: ChatTurn[] }) {
  const [history, setHistory] = useState<ChatTurn[]>(initialHistory);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function ask(q?: string) {
    const question = (q ?? text).trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setText('');
    try {
      const r = await fetch('/api/signals/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? `Request failed: ${r.status}`);
      const turn: ChatTurn = {
        id: body.id ?? crypto.randomUUID(),
        question,
        answer: body.answer ?? '',
        charts: body.charts ?? [],
        cost_usd: body.cost_usd,
        duration_ms: body.duration_ms,
      };
      setHistory((h) => [turn, ...h]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ask failed.');
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      ask();
    }
  }

  return (
    <section className="mt-6 rounded-2xl bg-surface shadow-soft p-5 space-y-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-h3">Ask</h3>
        <span className="text-micro text-ink-3 font-mono">
          Grounded in your data · Sonnet 4.6 + tools
        </span>
      </header>

      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          disabled={busy}
          placeholder="Ask anything about your last 90 days — patterns, comparisons, what predicts what."
          className="w-full p-3 bg-bg border border-line rounded-xl text-body focus:border-ink focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {history.length === 0 &&
              EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  disabled={busy}
                  className="text-micro text-ink-2 hover:text-ink rounded-full border border-line px-3 py-1 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-micro text-ink-3 font-mono">⌘↵</span>
            <button
              onClick={() => ask()}
              disabled={busy || !text.trim()}
              className="h-10 px-4 bg-accent text-accent-fg rounded-xl text-small font-semibold disabled:opacity-50"
            >
              {busy ? 'Thinking…' : 'Ask'}
            </button>
          </div>
        </div>
        {error && <p className="text-small text-signal-red">{error}</p>}
      </div>

      {history.length > 0 && (
        <div className="space-y-5 pt-3 border-t border-line">
          {history.map((turn) => (
            <Turn key={turn.id} turn={turn} />
          ))}
        </div>
      )}
    </section>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  return (
    <article className="space-y-3">
      <p className="text-small text-ink-3">
        <span className="font-mono uppercase tracking-wide">You</span> · {turn.question}
      </p>
      <div className="space-y-3">
        {turn.answer && <p className="text-body text-ink leading-relaxed">{turn.answer}</p>}
        {turn.charts.map((c, i) => (
          <SpecChart key={i} data={c} />
        ))}
      </div>
      {(turn.cost_usd != null || turn.duration_ms != null) && (
        <p className="text-micro text-ink-3 font-mono">
          {turn.duration_ms != null && `${(turn.duration_ms / 1000).toFixed(1)}s`}
          {turn.duration_ms != null && turn.cost_usd != null && ' · '}
          {turn.cost_usd != null && `$${turn.cost_usd.toFixed(4)}`}
        </p>
      )}
    </article>
  );
}
