'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RecordButton } from '@/components/RecordButton';

interface StackItem {
  id: string;
  name: string;
  dose: string | null;
  timing: string | null;
  stack_group: string | null;
  active: boolean;
}

interface ProposedItem {
  name: string;
  dose: string | null;
  timing: string | null;
  stack_group: string | null;
}

type FlowState =
  | { kind: 'idle' }
  | { kind: 'transcribing' }
  | { kind: 'parsing' }
  | { kind: 'review'; proposed: ProposedItem[] }
  | { kind: 'saving' }
  | { kind: 'done'; inserted: number; updated: number }
  | { kind: 'error'; message: string };

const GROUP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'morning_stack', label: 'morning' },
  { value: 'day_stack', label: 'day' },
  { value: 'sleep_stack', label: 'sleep' },
];

export default function StackPage() {
  const [stack, setStack] = useState<StackItem[] | null>(null);
  const [flow, setFlow] = useState<FlowState>({ kind: 'idle' });

  const loadStack = useCallback(async () => {
    try {
      const r = await fetch('/api/stack/list');
      if (!r.ok) throw new Error(`load failed: ${r.status}`);
      const j = (await r.json()) as { items: StackItem[] };
      setStack(j.items);
    } catch (e) {
      setStack([]);
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadStack();
  }, [loadStack]);

  const onRecorded = useCallback(async (blob: Blob, mimeType: string) => {
    setFlow({ kind: 'transcribing' });
    try {
      const form = new FormData();
      form.append(
        'audio',
        new File([blob], `stack.${extFor(mimeType)}`, { type: mimeType }),
      );
      const tx = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!tx.ok) throw new Error(`transcribe failed: ${tx.status}`);
      const t = (await tx.json()) as { transcript: string };

      setFlow({ kind: 'parsing' });
      const px = await fetch('/api/stack/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: t.transcript }),
      });
      if (!px.ok) {
        const body = await px.json().catch(() => null);
        throw new Error(body?.error ?? `parse failed: ${px.status}`);
      }
      const p = (await px.json()) as { items: ProposedItem[] };
      if (p.items.length === 0) {
        setFlow({ kind: 'error', message: 'no supplements found in that recording.' });
        return;
      }
      setFlow({ kind: 'review', proposed: p.items });
    } catch (e) {
      setFlow({ kind: 'error', message: e instanceof Error ? e.message : 'something went wrong' });
    }
  }, []);

  const isEmpty = stack !== null && stack.length === 0;

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="p-4 flex justify-between items-center">
        <Link href="/" className="text-small text-ink-2 hover:text-ink font-mono">
          ← back
        </Link>
        <h1 className="text-small font-mono text-ink-2">stack</h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 px-4 max-w-xl mx-auto w-full space-y-6 pb-12">
        {flow.kind === 'review' ? (
          <ReviewScreen
            proposed={flow.proposed}
            onCancel={() => setFlow({ kind: 'idle' })}
            onSave={async (rows) => {
              setFlow({ kind: 'saving' });
              try {
                const r = await fetch('/api/stack/commit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items: rows }),
                });
                if (!r.ok) {
                  const body = await r.json().catch(() => null);
                  throw new Error(body?.error ?? `save failed: ${r.status}`);
                }
                const j = (await r.json()) as { inserted: number; updated: number };
                setFlow({ kind: 'done', inserted: j.inserted, updated: j.updated });
                await loadStack();
              } catch (e) {
                setFlow({
                  kind: 'error',
                  message: e instanceof Error ? e.message : 'save failed',
                });
              }
            }}
          />
        ) : (
          <>
            {isEmpty ? (
              <EmptyState />
            ) : stack === null ? (
              <p className="text-small text-ink-3 font-mono">loading…</p>
            ) : (
              <CurrentStack items={stack} />
            )}

            <div className="space-y-2">
              {(flow.kind === 'idle' || flow.kind === 'done' || flow.kind === 'error') && (
                <RecordButton onRecorded={onRecorded} />
              )}
              {flow.kind === 'transcribing' && <StatusLine label="transcribing…" />}
              {flow.kind === 'parsing' && <StatusLine label="extracting supplements…" />}
              {flow.kind === 'saving' && <StatusLine label="saving…" />}
              {flow.kind === 'done' && (
                <p className="text-small font-mono text-ink-2">
                  saved · {flow.inserted} new, {flow.updated} updated
                </p>
              )}
              {flow.kind === 'error' && (
                <p className="text-small font-mono text-signal-red">{flow.message}</p>
              )}
              <p className="text-micro text-ink-3 font-mono">
                {isEmpty
                  ? 'say each supplement with dose and timing. e.g. "I take protein shake every morning, 5g creatine, 600mg magnesium glycinate before bed."'
                  : 'speak any additions or changes. e.g. "adding vitamin E 400 IU to my morning stack."'}
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="pt-6 pb-2 space-y-2">
      <h2 className="text-h2">record your vitamin stack</h2>
      <p className="text-body text-ink-2">
        tap below and list everything you take. include dose and timing if you can.
      </p>
    </div>
  );
}

function CurrentStack({ items }: { items: StackItem[] }) {
  const grouped = groupByStack(items);
  return (
    <div className="space-y-5 pt-2">
      <h2 className="text-h2">your stack</h2>
      {Object.entries(grouped).map(([group, rows]) => (
        <section key={group} className="space-y-2">
          <p className="text-micro text-ink-3 uppercase tracking-wide font-mono">
            {labelForGroup(group)}
          </p>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between text-body">
                <span>{r.name}</span>
                <span className="text-small text-ink-2 font-mono">
                  {[r.dose, r.timing].filter(Boolean).join(' · ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ReviewScreen({
  proposed,
  onSave,
  onCancel,
}: {
  proposed: ProposedItem[];
  onSave: (items: ProposedItem[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ProposedItem[]>(proposed);

  function update(i: number, patch: Partial<ProposedItem>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h2 className="text-h2">confirm</h2>
        <p className="text-small text-ink-2">edit any row before saving. swipe-remove with ×.</p>
      </div>

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="space-y-2 border border-line rounded p-3">
            <div className="flex items-center gap-2">
              <input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="name"
                className="flex-1 bg-transparent border-b border-line text-body focus:border-ink focus:outline-none py-1"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-ink-3 hover:text-signal-red font-mono px-2"
                aria-label="remove"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={r.dose ?? ''}
                onChange={(e) => update(i, { dose: e.target.value || null })}
                placeholder="dose (e.g. 500 mg)"
                className="bg-transparent border border-line rounded px-2 py-1 text-small font-mono focus:border-ink focus:outline-none"
              />
              <input
                value={r.timing ?? ''}
                onChange={(e) => update(i, { timing: e.target.value || null })}
                placeholder="timing"
                className="bg-transparent border border-line rounded px-2 py-1 text-small font-mono focus:border-ink focus:outline-none"
              />
            </div>
            <select
              value={r.stack_group ?? ''}
              onChange={(e) => update(i, { stack_group: e.target.value || null })}
              className="w-full bg-transparent border border-line rounded px-2 py-1 text-small font-mono focus:border-ink focus:outline-none"
            >
              {GROUP_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 h-11 border border-line rounded text-body font-mono"
        >
          cancel
        </button>
        <button
          onClick={() => onSave(rows)}
          disabled={rows.length === 0}
          className="flex-1 h-11 bg-accent text-accent-fg rounded text-body font-medium disabled:opacity-60"
        >
          save {rows.length} item{rows.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function StatusLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-small font-mono text-ink-2">
      <span className="inline-block w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" />
      <span>{label}</span>
    </div>
  );
}

function groupByStack(items: StackItem[]): Record<string, StackItem[]> {
  const out: Record<string, StackItem[]> = {};
  for (const it of items) {
    const key = it.stack_group ?? 'other';
    if (!out[key]) out[key] = [];
    out[key].push(it);
  }
  return out;
}

function labelForGroup(group: string): string {
  switch (group) {
    case 'morning_stack':
      return 'morning';
    case 'day_stack':
      return 'day';
    case 'sleep_stack':
      return 'sleep';
    case 'other':
      return 'unassigned';
    default:
      return group;
  }
}

function extFor(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}
