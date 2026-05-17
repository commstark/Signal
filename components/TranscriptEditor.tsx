'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  entryId: string;
  initial: string;
  onSaved?: (newText: string) => void;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function TranscriptEditor({ entryId, initial, onSaved }: Props) {
  const router = useRouter();
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
    await runParse(next);
  }

  async function runParse(transcript: string) {
    setStatus('saving');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, re_parse_entry_id: entryId }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setSavedText(transcript);
      setStatus('saved');
      onSaved?.(transcript);
      // Re-fetch the surrounding server-rendered page (e.g. /today stats)
      // so numbers reflect the re-parsed log immediately.
      router.refresh();
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => runParse(savedText)}
            disabled={status === 'saving'}
            className="text-micro text-ink-3 font-mono hover:text-ink-2 disabled:opacity-50"
          >
            re-parse
          </button>
          {status === 'saving' && (
            <span className="text-micro text-ink-3 font-mono">saving…</span>
          )}
          {status === 'saved' && (
            <span className="text-micro text-ink-3 font-mono">saved · re-parsed</span>
          )}
          {status === 'error' && errorMsg && (
            <span className="text-micro text-signal-red font-mono">{errorMsg}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        rows={Math.max(3, Math.ceil(text.length / 60))}
        className="w-full p-3 bg-surface border border-line rounded text-body focus:border-ink focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={commit}
          disabled={status === 'saving'}
          className="h-9 px-4 bg-accent text-accent-fg rounded text-small font-medium disabled:opacity-60"
        >
          {status === 'saving' ? 'saving…' : 'done · re-parse'}
        </button>
        <button
          onClick={() => {
            setText(savedText);
            setEditing(false);
          }}
          className="h-9 px-4 border border-line rounded text-small"
        >
          cancel
        </button>
        <span className="text-micro text-ink-3 font-mono ml-auto">
          tap outside or done
        </span>
      </div>
    </div>
  );
}
