'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  entryId: string;
  initial: string;
  onSaved?: (newText: string) => void;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function TranscriptEditor({ entryId, initial, onSaved }: Props) {
  const [text, setText] = useState(initial);
  const [savedText, setSavedText] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  async function commit() {
    setEditing(false);
    const next = text.trim();
    if (next === savedText.trim() || next === '') {
      setText(savedText);
      return;
    }
    setStatus('saving');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: next, re_parse_entry_id: entryId }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setSavedText(next);
      setStatus('saved');
      onSaved?.(next);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'failed');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      setText(savedText);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-1">
        <button
          onClick={() => setEditing(true)}
          className="text-body text-ink text-left w-full hover:text-ink-2 transition-colors"
        >
          {text}
        </button>
        {status === 'saving' && (
          <p className="text-micro text-ink-3 font-mono">saving…</p>
        )}
        {status === 'saved' && (
          <p className="text-micro text-ink-3 font-mono">saved · re-parsed</p>
        )}
        {status === 'error' && errorMsg && (
          <p className="text-micro text-signal-red font-mono">{errorMsg}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        rows={Math.max(3, Math.ceil(text.length / 60))}
        className="w-full p-3 bg-surface border border-line rounded text-body focus:border-ink focus:outline-none"
      />
      <p className="text-micro text-ink-3 font-mono">tap outside to save · esc to cancel</p>
    </div>
  );
}
