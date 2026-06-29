'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UploadResponse {
  ok: boolean;
  upload_id?: string;
  parse_status?: 'pending' | 'ok' | 'partial' | 'failed';
  panels_written?: number;
  analytes_written?: number;
  confidence?: 'high' | 'medium' | 'low';
  warnings?: string[];
  error?: string;
}

// Single-file uploader for lab PDFs and screenshots. Server takes 5-15s
// to extract — we keep the button in an explicit "Extracting…" state with
// a pulsing dot so the user can tell something is happening (matches the
// orange = working status vocabulary used across the app).
export function LabUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<UploadResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setState('uploading');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/labs/upload', { method: 'POST', body: fd });
      const body = (await res.json()) as UploadResponse;
      setResult(body);
      setState(res.ok && body.ok ? 'done' : 'error');
      if (res.ok) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      setState('error');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4">
      <label className="block">
        <span className="text-small text-ink-2">PDF or image (PNG / JPEG / WebP)</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-small text-ink file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-ink file:text-bg file:text-small file:cursor-pointer file:hover:bg-ink-2"
        />
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={!file || state === 'uploading'}
          className="px-4 py-2 rounded-xl bg-ink text-bg text-small font-mono disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {state === 'uploading' && (
            <span className="inline-block w-2 h-2 rounded-full bg-signal-orange animate-dot-pulse" />
          )}
          {state === 'uploading' ? 'Extracting…' : 'Upload + extract'}
        </button>
        {state === 'uploading' && (
          <span className="text-micro font-mono text-ink-3">
            5–15s · Sonnet reads every analyte
          </span>
        )}
      </div>

      {result && state === 'done' && (
        <div className="mt-3 text-micro font-mono text-ink-2">
          <span className="text-signal-green">{result.parse_status}</span>
          {' · '}
          {result.panels_written} panel{result.panels_written === 1 ? '' : 's'} ·{' '}
          {result.analytes_written} analyte{result.analytes_written === 1 ? '' : 's'} ·{' '}
          confidence: {result.confidence}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i} className="text-ink-3">
                  · {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && state === 'error' && (
        <p className="mt-3 text-micro font-mono text-signal-red">
          {result.error ?? 'Upload failed.'}
        </p>
      )}
    </form>
  );
}
