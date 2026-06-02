'use client';

import { useEffect, useState } from 'react';

const AUTO_RECORD_PREF_KEY = 'signal.autoRecordOnOpen';

// localStorage-backed toggle: when on, /today's fresh open auto-fires
// the record button. Per-device because that's the only place mic
// permission lives. Settable by tap; doesn't need a DB roundtrip.
export function AutoRecordToggle() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(AUTO_RECORD_PREF_KEY) === '1');
    } catch {
      /* private mode — toggle is session-only */
    }
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      if (next) localStorage.setItem(AUTO_RECORD_PREF_KEY, '1');
      else localStorage.removeItem(AUTO_RECORD_PREF_KEY);
    } catch {
      /* swallow — UI state still reflects intent for this session */
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
      <div>
        <p className="text-body text-ink">Auto-record on app open</p>
        <p className="text-small text-ink-2 leading-relaxed mt-0.5">
          Skip the tap. When you open the app, the mic starts recording immediately. Per-device,
          since it depends on your microphone permission here.
        </p>
      </div>
      <button
        onClick={toggle}
        role="switch"
        aria-checked={enabled}
        aria-label="Auto-record on app open"
        disabled={!hydrated}
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-ink' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-surface shadow-soft-sm transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
