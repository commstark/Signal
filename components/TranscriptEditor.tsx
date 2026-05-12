'use client';

import { useState } from 'react';

interface Props {
  entryId: string;
  initial: string;
  onSaved?: (newText: string) => void;
}

export function TranscriptEditor({ entryId, initial, onSaved }: Props) {
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (text.trim() === initial.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, re_parse_entry_id: entryId }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setEditing(false);
      onSaved?.(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-body text-ink text-left w-full hover:text-ink-2 transition-colors"
      >
        {text}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, Math.ceil(text.length / 60))}
        className="w-full p-3 bg-surface border border-line rounded text-body focus:border-ink focus:outline-none"
      />
      {error && <p className="text-small text-signal-red">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="h-9 px-4 bg-accent text-accent-fg rounded text-small font-medium disabled:opacity-60"
        >
          {saving ? 'saving…' : 'save · re-parse'}
        </button>
        <button
          onClick={() => {
            setText(initial);
            setEditing(false);
          }}
          className="h-9 px-4 border border-line rounded text-small"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
