'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StatusDot, type StatusTone } from '@/components/StatusDot';
import { DEMO_LINE } from '@/lib/demo';

const SEEN_KEY = 'signal.tourSeen';

interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  clicking: boolean;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// One-time guided tour for brand-new users. Plays a ghost capture on the
// record screen, then "taps" today, walks the real /today tiles (demo
// data), and returns. Runs once (localStorage), is always skippable, and
// collapses to instant cuts under prefers-reduced-motion.
export function FirstRunTour() {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [scene, setScene] = useState<'home' | 'today' | null>(null);
  const [ghost, setGhost] = useState<{ tone: StatusTone; label: string } | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState>({ x: -100, y: -100, visible: false, clicking: false });
  const [box, setBox] = useState<Box | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduced = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // Schedule a step; reduced motion compresses the whole timeline.
  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms * (reduced.current ? 0.12 : 1)));
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — tour just replays, no harm */
    }
    setActive(false);
    setScene(null);
    setGhost(null);
    setCaption(null);
    setBox(null);
    setCursor((c) => ({ ...c, visible: false }));
  }, [clearTimers]);

  const skip = useCallback(() => {
    const onToday = pathname === '/today';
    finish();
    if (onToday) router.push('/');
  }, [finish, pathname, router]);

  const pointAt = useCallback((selector: string) => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCursor({ x: r.left + r.width / 2, y: r.top + r.height / 2, visible: true, clicking: false });
  }, []);

  const highlight = useCallback((selector: string) => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
  }, []);

  const click = useCallback(() => {
    setCursor((c) => ({ ...c, clicking: true }));
    at(reduced.current ? 1 : 220, () => setCursor((c) => ({ ...c, clicking: false })));
  }, [at]);

  useEffect(() => {
    setMounted(true);
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  // Decide whether to start. Only on the record screen, only once, and
  // never when the Action Button shortcut (?mode=auto) is mid-capture.
  useEffect(() => {
    if (!mounted || active) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    if (search.get('mode') === 'auto') return;
    if (pathname === '/') {
      setActive(true);
      setScene('home');
    }
  }, [mounted, pathname, search, active]);

  // HOME: ghost capture, then point at "today" and navigate.
  useEffect(() => {
    if (!active || scene !== 'home') return;
    clearTimers();
    setBox(null);
    setShowTranscript(false);
    setCursor((c) => ({ ...c, visible: false }));
    setCaption('this is you logging — just talk.');
    setGhost({ tone: 'progress', label: 'transcribing…' });

    at(1300, () => setGhost({ tone: 'progress', label: 'parsing…' }));
    at(2700, () => {
      setGhost({ tone: 'done', label: 'done · mixed' });
      setShowTranscript(true);
    });
    // Cursor appears over the card, then glides up to the "today" link.
    at(3700, () =>
      setCursor({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2 + 64,
        visible: true,
        clicking: false,
      }),
    );
    at(4200, () => {
      setCaption('everything you say flows into today →');
      highlight('today-link');
      pointAt('today-link');
    });
    at(5400, click);
    at(5900, () => {
      router.push('/today?tour=1');
      setScene('today');
    });
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scene]);

  // TODAY: walk protein → water → workouts, then point at back and return.
  useEffect(() => {
    if (!active || scene !== 'today' || pathname !== '/today') return;
    clearTimers();
    setGhost(null);
    setShowTranscript(false);
    setCursor((c) => ({ ...c, visible: false }));
    const behavior: ScrollBehavior = reduced.current ? 'auto' : 'smooth';

    at(500, () => {
      setCaption('today — your day at a glance.');
      highlight('tile-protein');
    });
    at(1700, () => highlight('tile-water'));
    at(2900, () => {
      document.querySelector('[data-tour="workouts"]')?.scrollIntoView({ behavior, block: 'center' });
      at(reduced.current ? 1 : 600, () => {
        setCaption('…down to your workout.');
        highlight('workouts');
      });
    });
    at(4800, () => {
      window.scrollTo({ top: 0, behavior });
      at(reduced.current ? 1 : 500, () => {
        setCaption('tap back any time to keep logging.');
        highlight('back-link');
        pointAt('back-link');
      });
    });
    at(6000, click);
    at(6500, () => {
      finish();
      router.push('/');
    });
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scene, pathname]);

  if (!mounted || !active) return null;

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: 'none' }}>
      {/* Home scrim blocks interaction during the ghost demo; tap = skip. */}
      {scene === 'home' && (
        <div
          className="absolute inset-0 bg-bg/85 backdrop-blur-sm"
          style={{ pointerEvents: 'auto' }}
          onClick={skip}
          aria-hidden
        />
      )}

      {/* Highlight ring around the focused tile / section. */}
      {box && (
        <div
          className="absolute rounded-md border-2 border-signal-orange animate-tour-pulse"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none' }}
        />
      )}

      {/* Ghost capture card. */}
      {scene === 'home' && ghost && (
        <div
          className="absolute left-1/2 top-1/2 w-[min(22rem,86vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 shadow-xl space-y-3"
          style={{ pointerEvents: 'none' }}
        >
          <div className="flex items-center gap-3 text-small font-mono text-ink-2">
            <StatusDot tone={ghost.tone} />
            <span>{ghost.label}</span>
          </div>
          {showTranscript && (
            <p className="text-body text-ink leading-snug">&ldquo;{DEMO_LINE}&rdquo;</p>
          )}
        </div>
      )}

      {/* Caption pill. */}
      {caption && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface px-4 py-2 text-small font-mono text-ink-2 shadow-lg">
          {caption}
        </div>
      )}

      {/* Faux cursor. */}
      {cursor.visible && (
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${cursor.x - 13}px, ${cursor.y - 13}px)`,
            transition: reduced.current ? 'none' : 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
          }}
        >
          <div
            className={`h-[26px] w-[26px] rounded-full border-2 border-ink bg-ink/10 transition-transform ${
              cursor.clicking ? 'scale-75' : ''
            }`}
          />
          {cursor.clicking && (
            <div className="absolute inset-0 rounded-full border-2 border-ink animate-tour-ripple" />
          )}
        </div>
      )}

      {/* Always-available exit. */}
      <button
        onClick={skip}
        className="absolute top-4 right-4 text-micro font-mono text-ink-3 hover:text-ink underline underline-offset-4"
        style={{ pointerEvents: 'auto' }}
      >
        skip
      </button>
    </div>
  );
}
