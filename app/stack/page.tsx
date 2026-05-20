'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

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
  { value: 'morning_stack', label: 'morning' },
  { value: 'day_stack', label: 'day' },
  { value: 'sleep_stack', label: 'sleep' },
];

export default function SettingsPage() {
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
    <main className="min-h-dvh flex flex-col">
      <header className="p-4 flex justify-between items-center">
        <Link href="/" className="text-small text-ink-2 hover:text-ink font-mono">
          ← back
        </Link>
        <h1 className="text-small font-mono text-ink-2">your account</h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 px-4 max-w-xl mx-auto w-full space-y-10 pb-12">
        <p className="text-small text-ink-2">
          add or edit anything below by tapping a row. to add by voice, go back home and speak naturally — e.g. <span className="font-mono">&quot;from now on I take 400 IU vitamin E in the morning&quot;</span>.
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
        <h2 className="text-h2">vitamin stack</h2>
        <button
          onClick={() => setAdding(true)}
          className="text-small font-mono text-ink-2 hover:text-ink"
        >
          + add
        </button>
      </div>

      {items === null ? (
        <p className="text-small font-mono text-ink-3">loading…</p>
      ) : items.length === 0 && !adding ? (
        <p className="text-small text-ink-2">
          nothing here yet. say something like <span className="font-mono">&quot;from now on I take 5g creatine in the morning&quot;</span> on the home page.
        </p>
      ) : (
        <ul className="list-none space-y-1">
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
      setErr('name required');
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
        throw new Error(b?.error ?? `save failed: ${r.status}`);
      }
      setEditing(false);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (mode === 'new') {
      onCancel?.();
      return;
    }
    if (!confirm(`remove ${item.name} from your stack?`)) return;
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
        className="flex items-baseline justify-between text-body cursor-pointer hover:bg-line/20 -mx-2 px-2 py-1.5 rounded"
      >
        <span>{item.name}</span>
        <span className="text-small text-ink-2 font-mono">
          {[item.dose, item.timing, labelForGroup(item.stack_group)]
            .filter(Boolean)
            .join(' · ') || 'tap to edit'}
        </span>
      </li>
    );
  }

  return (
    <li className="list-none space-y-2 border border-line rounded p-3">
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="name"
        className="w-full bg-transparent border-b border-line text-body focus:border-ink focus:outline-none py-1"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.dose ?? ''}
          onChange={(e) => setDraft({ ...draft, dose: e.target.value || null })}
          placeholder="dose (e.g. 500 mg)"
          className="bg-transparent border border-line rounded px-2 py-1 text-small font-mono focus:border-ink focus:outline-none"
        />
        <input
          value={draft.timing ?? ''}
          onChange={(e) => setDraft({ ...draft, timing: e.target.value || null })}
          placeholder="timing"
          className="bg-transparent border border-line rounded px-2 py-1 text-small font-mono focus:border-ink focus:outline-none"
        />
      </div>
      <select
        value={draft.stack_group ?? ''}
        onChange={(e) => setDraft({ ...draft, stack_group: e.target.value || null })}
        className="w-full bg-transparent border border-line rounded px-2 py-1 text-small font-mono focus:border-ink focus:outline-none"
      >
        {GROUP_OPTIONS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
      {err && <p className="text-small text-signal-red font-mono">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 h-10 bg-accent text-accent-fg rounded text-small font-medium font-mono disabled:opacity-60"
        >
          save
        </button>
        <button
          onClick={() => {
            setDraft(item);
            setEditing(false);
            onCancel?.();
          }}
          disabled={busy}
          className="h-10 px-4 border border-line rounded text-small font-mono"
        >
          cancel
        </button>
        {mode === 'existing' && (
          <button
            onClick={remove}
            disabled={busy}
            className="h-10 px-4 border border-line rounded text-small font-mono text-signal-red"
          >
            remove
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
        <h2 className="text-h2">preferences</h2>
        <button
          onClick={() => setAdding(true)}
          className="text-small font-mono text-ink-2 hover:text-ink"
        >
          + add
        </button>
      </div>

      {items === null ? (
        <p className="text-small font-mono text-ink-3">loading…</p>
      ) : items.length === 0 && !adding ? (
        <p className="text-small text-ink-2">
          nothing here yet. on the home page, say something like &ldquo;from now on a serving of meat is half a pound for me.&rdquo;
        </p>
      ) : (
        <ul className="list-none space-y-1">
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
      setErr('please describe what this is');
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
        throw new Error(b?.error ?? `save failed: ${r.status}`);
      }
      setEditing(false);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (mode === 'new') {
      onCancel?.();
      return;
    }
    if (!confirm(`remove "${displayLabel}"?`)) return;
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
    return (
      <li
        onClick={() => setEditing(true)}
        className="flex items-baseline justify-between text-body cursor-pointer hover:bg-line/20 -mx-2 px-2 py-1.5 rounded"
      >
        <span>{displayLabel}</span>
        <span className="text-small text-ink-2 font-mono">
          {item.value_num != null
            ? `${item.value_num}${item.unit ? ' ' + item.unit : ''}`
            : item.value_text || 'tap to edit'}
        </span>
      </li>
    );
  }

  return (
    <li className="list-none space-y-2 border border-line rounded p-3">
      <input
        value={draft.notes ?? ''}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="what is it? e.g. cup of water, serving of meat"
        className="w-full bg-transparent border-b border-line text-body focus:border-ink focus:outline-none py-1"
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
          placeholder="value"
          className="bg-transparent border border-line rounded px-3 py-2 text-body font-mono focus:border-ink focus:outline-none"
        />
        <input
          value={draft.unit ?? ''}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value || null })}
          placeholder="unit"
          className="w-20 bg-transparent border border-line rounded px-3 py-2 text-body font-mono focus:border-ink focus:outline-none"
        />
      </div>
      {err && <p className="text-small text-signal-red font-mono">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 h-10 bg-accent text-accent-fg rounded text-small font-medium font-mono disabled:opacity-60"
        >
          save
        </button>
        <button
          onClick={() => {
            setDraft(item);
            setEditing(false);
            onCancel?.();
          }}
          disabled={busy}
          className="h-10 px-4 border border-line rounded text-small font-mono"
        >
          cancel
        </button>
        {mode === 'existing' && (
          <button
            onClick={remove}
            disabled={busy}
            className="h-10 px-4 border border-line rounded text-small font-mono text-signal-red"
          >
            remove
          </button>
        )}
      </div>
    </li>
  );
}

function labelForPref(item: PrefItem): string {
  if (item.notes?.trim()) return item.notes.trim();
  // Fall back to humanising the snake_case key for old rows.
  const k = item.key.replace(/_(g|ml|kcal|iu|oz|mg|mcg)$/i, '').replace(/_/g, ' ');
  return k || item.key;
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
  if (group === 'morning_stack') return 'morning';
  if (group === 'day_stack') return 'day';
  if (group === 'sleep_stack') return 'sleep';
  return group;
}
