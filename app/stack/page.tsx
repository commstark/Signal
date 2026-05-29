'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface StackItem {
  id: string;
  name: string;
  dose: string | null;
  timing: string | null;
  stack_group: string | null;
  active: boolean;
}

interface PrefItem {
  id: string;
  key: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  notes: string | null;
  source: string;
  updated_at: string;
}

const GROUP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'morning_stack', label: 'Morning' },
  { value: 'day_stack', label: 'Day' },
  { value: 'sleep_stack', label: 'Sleep' },
];

export default function AccountPage() {
  const [stack, setStack] = useState<StackItem[] | null>(null);
  const [prefs, setPrefs] = useState<PrefItem[] | null>(null);

  const loadAll = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch('/api/stack/list').then((r) => r.json()).catch(() => ({ items: [] })),
      fetch('/api/preferences/list').then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    setStack((s.items ?? []) as StackItem[]);
    setPrefs((p.items ?? []) as PrefItem[]);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <main className="min-h-dvh pb-12">
      <header className="px-4 py-4">
        <Link
          href="/"
          className="text-small text-ink-2 hover:text-ink inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <h1 className="text-h1 mt-3">Account</h1>
      </header>

      <div className="flex-1 px-4 max-w-xl mx-auto w-full space-y-10">
        <p className="text-small text-ink-2 leading-relaxed">
          Add or edit anything below by tapping a row. To add by voice, go home and speak
          naturally — e.g.{' '}
          <span className="text-ink">
            &ldquo;From now on I take 400 IU vitamin E in the morning.&rdquo;
          </span>
        </p>

        <StackSection items={stack} reload={loadAll} />
        <PrefsSection items={prefs} reload={loadAll} />
      </div>
    </main>
  );
}

function StackSection({
  items,
  reload,
}: {
  items: StackItem[] | null;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2">Vitamin stack</h2>
        <button
          onClick={() => setAdding(true)}
          className="text-small text-ink-2 hover:text-ink"
        >
          + Add
        </button>
      </div>

      {items === null ? (
        <p className="text-small text-ink-3">Loading…</p>
      ) : items.length === 0 && !adding ? (
        <p className="text-small text-ink-2 leading-relaxed">
          Nothing here yet. Say something like{' '}
          <span className="text-ink">
            &ldquo;From now on I take 5g creatine in the morning.&rdquo;
          </span>
        </p>
      ) : (
        <ul className="rounded-2xl bg-surface shadow-soft divide-y divide-line overflow-hidden">
          {items.map((it) => (
            <StackRow key={it.id} item={it} reload={reload} />
          ))}
        </ul>
      )}

      {adding && (
        <StackRow
          mode="new"
          item={{
            id: '',
            name: '',
            dose: null,
            timing: null,
            stack_group: null,
            active: true,
          }}
          reload={async () => {
            setAdding(false);
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function StackRow({
  item,
  reload,
  mode = 'existing',
  onCancel,
}: {
  item: StackItem;
  reload: () => Promise<void>;
  mode?: 'existing' | 'new';
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(mode === 'new');
  const [draft, setDraft] = useState<StackItem>(item);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!draft.name.trim()) {
      setErr('Name required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/stack/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mode === 'existing' ? draft.id : undefined,
          name: draft.name,
          dose: draft.dose,
          timing: draft.timing,
          stack_group: draft.stack_group,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => null);
        throw new Error(b?.error ?? `Save failed: ${r.status}`);
      }
      setEditing(false);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (mode === 'new') {
      onCancel?.();
      return;
    }
    if (!confirm(`Remove ${item.name} from your stack?`)) return;
    setBusy(true);
    try {
      await fetch('/api/stack/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <li
        onClick={() => setEditing(true)}
        className="flex flex-col gap-1 px-4 py-3 cursor-pointer hover:bg-surface-2/50 transition-colors"
      >
        <span className="text-body">{item.name}</span>
        <span className="text-small text-ink-2 tabular-nums">{detailForStack(item)}</span>
      </li>
    );
  }

  return (
    <li className="list-none rounded-2xl bg-surface p-4 space-y-3 shadow-soft">
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Name"
        className="w-full bg-transparent border-b border-line text-body focus:border-ink focus:outline-none py-2"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.dose ?? ''}
          onChange={(e) => setDraft({ ...draft, dose: e.target.value || null })}
          placeholder="Dose (e.g. 500 mg)"
          className="bg-transparent border border-line rounded-xl px-3 py-2 text-small focus:border-ink focus:outline-none"
        />
        <input
          value={draft.timing ?? ''}
          onChange={(e) => setDraft({ ...draft, timing: e.target.value || null })}
          placeholder="Timing"
          className="bg-transparent border border-line rounded-xl px-3 py-2 text-small focus:border-ink focus:outline-none"
        />
      </div>
      <select
        value={draft.stack_group ?? ''}
        onChange={(e) => setDraft({ ...draft, stack_group: e.target.value || null })}
        className="w-full bg-transparent border border-line rounded-xl px-3 py-2 text-small focus:border-ink focus:outline-none"
      >
        {GROUP_OPTIONS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
      {err && <p className="text-small text-signal-red">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 h-10 bg-accent text-accent-fg rounded-xl text-small font-semibold disabled:opacity-60"
        >
          Save
        </button>
        <button
          onClick={() => {
            setDraft(item);
            setEditing(false);
            onCancel?.();
          }}
          disabled={busy}
          className="h-10 px-4 border border-line rounded-xl text-small"
        >
          Cancel
        </button>
        {mode === 'existing' && (
          <button
            onClick={remove}
            disabled={busy}
            className="h-10 px-4 border border-line rounded-xl text-small text-signal-red"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function PrefsSection({
  items,
  reload,
}: {
  items: PrefItem[] | null;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2">Preferences</h2>
        <button
          onClick={() => setAdding(true)}
          className="text-small text-ink-2 hover:text-ink"
        >
          + Add
        </button>
      </div>

      {items === null ? (
        <p className="text-small text-ink-3">Loading…</p>
      ) : items.length === 0 && !adding ? (
        <p className="text-small text-ink-2 leading-relaxed">
          Nothing here yet. On the home page, say something like{' '}
          <span className="text-ink">
            &ldquo;From now on a serving of meat is half a pound for me.&rdquo;
          </span>
        </p>
      ) : (
        <ul className="rounded-2xl bg-surface shadow-soft divide-y divide-line overflow-hidden">
          {items.map((it) => (
            <PrefRow key={it.id} item={it} reload={reload} />
          ))}
        </ul>
      )}

      {adding && (
        <PrefRow
          mode="new"
          item={{
            id: '',
            key: '',
            value_num: null,
            value_text: null,
            unit: null,
            notes: null,
            source: 'manual',
            updated_at: '',
          }}
          reload={async () => {
            setAdding(false);
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function PrefRow({
  item,
  reload,
  mode = 'existing',
  onCancel,
}: {
  item: PrefItem;
  reload: () => Promise<void>;
  mode?: 'existing' | 'new';
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(mode === 'new');
  const [draft, setDraft] = useState<PrefItem>(item);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const displayLabel = labelForPref(item);

  async function save() {
    const label = (draft.notes ?? '').trim();
    if (!label) {
      setErr('Please describe what this is.');
      return;
    }
    const key = mode === 'existing' ? draft.key : labelToKey(label, draft.unit);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/preferences/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              key,
              value_num: draft.value_num,
              value_text: draft.value_text,
              unit: draft.unit,
              notes: label,
            },
          ],
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => null);
        throw new Error(b?.error ?? `Save failed: ${r.status}`);
      }
      setEditing(false);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (mode === 'new') {
      onCancel?.();
      return;
    }
    if (!confirm(`Remove "${displayLabel}"?`)) return;
    setBusy(true);
    try {
      await fetch('/api/preferences/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    const detail =
      item.value_num != null
        ? `${item.value_num}${item.unit ? ' ' + item.unit : ''}`
        : item.value_text || 'Tap to edit';
    return (
      <li
        onClick={() => setEditing(true)}
        className="flex flex-col gap-1 px-4 py-3 cursor-pointer hover:bg-surface-2/50 transition-colors"
      >
        <span className="text-body">{displayLabel}</span>
        <span className="text-small text-ink-2 tabular-nums">{detail}</span>
      </li>
    );
  }

  return (
    <li className="list-none rounded-2xl bg-surface p-4 space-y-3 shadow-soft">
      <input
        value={draft.notes ?? ''}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="What is it? e.g. cup of water, serving of meat"
        className="w-full bg-transparent border-b border-line text-body focus:border-ink focus:outline-none py-2"
      />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          inputMode="decimal"
          value={draft.value_num ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            const n = v === '' ? null : Number(v);
            setDraft({ ...draft, value_num: Number.isFinite(n as number) ? (n as number) : null });
          }}
          placeholder="Value"
          className="bg-transparent border border-line rounded-xl px-3 py-2 text-body tabular-nums focus:border-ink focus:outline-none"
        />
        <input
          value={draft.unit ?? ''}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value || null })}
          placeholder="Unit"
          className="w-20 bg-transparent border border-line rounded-xl px-3 py-2 text-body focus:border-ink focus:outline-none"
        />
      </div>
      {err && <p className="text-small text-signal-red">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 h-10 bg-accent text-accent-fg rounded-xl text-small font-semibold disabled:opacity-60"
        >
          Save
        </button>
        <button
          onClick={() => {
            setDraft(item);
            setEditing(false);
            onCancel?.();
          }}
          disabled={busy}
          className="h-10 px-4 border border-line rounded-xl text-small"
        >
          Cancel
        </button>
        {mode === 'existing' && (
          <button
            onClick={remove}
            disabled={busy}
            className="h-10 px-4 border border-line rounded-xl text-small text-signal-red"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

// Build the secondary line for a stack row. Dedupes the common case where
// timing and stack_group both resolve to the same word (e.g. "Morning · Morning"),
// and humanizes snake_case timing values ("with_meals" -> "With meals").
function detailForStack(item: StackItem): string {
  const parts: string[] = [];
  if (item.dose) parts.push(item.dose);
  const timing = item.timing ? humanize(item.timing) : null;
  const group = labelForGroup(item.stack_group);
  if (timing && group && timing.toLowerCase() === group.toLowerCase()) {
    parts.push(timing);
  } else {
    if (timing) parts.push(timing);
    if (group) parts.push(group);
  }
  return parts.join(' · ') || 'Tap to edit';
}

function humanize(s: string): string {
  const cleaned = s.replace(/_/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function labelForPref(item: PrefItem): string {
  const raw = item.notes?.trim() || item.key.replace(/_(g|ml|kcal|iu|oz|mg|mcg)$/i, '').replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function labelToKey(label: string, unit: string | null): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const suffix = (unit ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!suffix || base.endsWith(`_${suffix}`)) return base;
  return `${base}_${suffix}`;
}

function labelForGroup(group: string | null): string | null {
  if (!group) return null;
  if (group === 'morning_stack') return 'Morning';
  if (group === 'day_stack') return 'Day';
  if (group === 'sleep_stack') return 'Sleep';
  return group;
}
