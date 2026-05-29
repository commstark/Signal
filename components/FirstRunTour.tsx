'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StatusDot, type StatusTone } from '@/components/StatusDot';

const SEEN_KEY = 'signal.tourSeen';

type Route = '/' | '/today';

interface Ghost {
  intent: string;
  transcript: string;
  // When true, the dot replays orange transcribing → orange parsing → green
  // done on scene enter so the user sees the vocabulary live (once).
  playSequence?: boolean;
}

interface Scene {
  route: Route;
  caption: string;
  ghost?: Ghost;
  cursorTarget?: string;
  highlightTarget?: string;
  scrollTo?: string | 'top';
}

// Each scene is one click. User drives pace; nothing auto-advances except
// the dot vocabulary inside scene 1 (which is the thing being taught).
const SCENES: Scene[] = [
  {
    route: '/',
    caption: 'talk. anything about your day.',
    highlightTarget: 'record-button',
  },
  {
    route: '/',
    caption: 'we transcribe it, parse what’s in it, and tag it.',
    ghost: {
      intent: 'food',
      transcript: 'two scoops of whey and a turkey sandwich.',
      playSequence: true,
    },
  },
  {
    route: '/',
    caption: 'food, like:',
    ghost: { intent: 'food', transcript: 'two scoops of whey and a turkey sandwich.' },
  },
  {
    route: '/',
    caption: 'workouts, like:',
    ghost: { intent: 'workout', transcript: 'benched 225 for six, three sets.' },
  },
  {
    route: '/',
    caption: 'supplements, like:',
    ghost: { intent: 'supplement', transcript: 'took my morning vitamin stack.' },
  },
  {
    route: '/',
    caption: 'calibrations — say once, used forever:',
    ghost: { intent: 'prefs', transcript: 'from now on a glass is 295ml.' },
  },
  {
    route: '/',
    caption: 'everything you say flows into today →',
    cursorTarget: 'today-link',
    highlightTarget: 'today-link',
  },
  {
    route: '/today',
    caption: 'today — your day, totaled.',
    scrollTo: 'top',
  },
  {
    route: '/today',
    caption: 'macros, with honest ±20–30% confidence.',
    highlightTarget: 'tile-protein',
  },
  {
    route: '/today',
    caption: 'water — what you sipped. precise once you calibrate “a glass”.',
    highlightTarget: 'tile-water',
  },
  {
    route: '/today',
    caption: 'workouts — sets, top set, duration.',
    scrollTo: 'workouts',
    highlightTarget: 'workouts',
  },
  {
    route: '/today',
    caption: 'tap back any time to keep logging.',
    scrollTo: 'top',
    cursorTarget: 'back-link',
    highlightTarget: 'back-link',
  },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function FirstRunTour() {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  // Ghost card state (driven by scene + the optional in-scene sequence).
  const [ghostTone, setGhostTone] = useState<StatusTone>('done');
  const [ghostLabel, setGhostLabel] = useState<string>('');
  const [showTranscript, setShowTranscript] = useState(true);

  // Overlay visuals.
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: -100,
    y: -100,
    visible: false,
  });
  const [box, setBox] = useState<Box | null>(null);

  const reduced = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Tracks router.push we initiated, so user-initiated navigation can be
  // detected and gracefully ends the tour.
  const expecting = useRef<Route | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

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
      setStep(0);
    }
  }, [mounted, pathname, search, active]);

  const finish = useCallback(() => {
    clearTimers();
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — tour just replays, no harm */
    }
    setActive(false);
    setStep(0);
    setBox(null);
    setCursor((c) => ({ ...c, visible: false }));
  }, [clearTimers]);

  const scene = SCENES[step];

  // Set up visuals when the step changes (or pathname catches up).
  useEffect(() => {
    if (!active || !scene) return;
    if (pathname !== scene.route) return; // wait for navigation to settle
    clearTimers();

    // Ghost card.
    if (scene.ghost) {
      if (scene.ghost.playSequence && !reduced.current) {
        setGhostTone('progress');
        setGhostLabel('transcribing…');
        setShowTranscript(false);
        timers.current.push(
          setTimeout(() => {
            setGhostTone('progress');
            setGhostLabel('parsing…');
          }, 1400),
        );
        timers.current.push(
          setTimeout(() => {
            setGhostTone('done');
            setGhostLabel(`done · ${scene.ghost!.intent}`);
            setShowTranscript(true);
          }, 2900),
        );
      } else {
        setGhostTone('done');
        setGhostLabel(`done · ${scene.ghost.intent}`);
        setShowTranscript(true);
      }
    }

    // Scroll.
    const behavior: ScrollBehavior = reduced.current ? 'auto' : 'smooth';
    if (scene.scrollTo) {
      if (scene.scrollTo === 'top') {
        window.scrollTo({ top: 0, behavior });
      } else {
        document
          .querySelector<HTMLElement>(`[data-tour="${scene.scrollTo}"]`)
          ?.scrollIntoView({ behavior, block: 'center' });
      }
    }

    // Position cursor + highlight box. Wait for scroll to settle if needed.
    const compute = () => {
      if (scene.cursorTarget) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${scene.cursorTarget}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          setCursor({ x: r.left + r.width / 2, y: r.top + r.height / 2, visible: true });
        }
      } else {
        setCursor((c) => ({ ...c, visible: false }));
      }
      if (scene.highlightTarget) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${scene.highlightTarget}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          setBox({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
        } else {
          setBox(null);
        }
      } else {
        setBox(null);
      }
    };
    if (scene.scrollTo && !reduced.current) {
      timers.current.push(setTimeout(compute, 500));
    } else {
      compute();
    }

    return clearTimers;
  }, [active, scene, pathname, clearTimers]);

  // End the tour gracefully if the user navigates away on their own (e.g.,
  // taps the real back link during a /today scene).
  useEffect(() => {
    if (!active) return;
    if (expecting.current && pathname === expecting.current) {
      expecting.current = null;
      return;
    }
    if (expecting.current === null && scene && pathname !== scene.route) {
      finish();
      if (pathname === '/today') router.push('/');
    }
  }, [pathname, active, scene, finish, router]);

  const goNext = useCallback(() => {
    const next = step + 1;
    if (next >= SCENES.length) {
      finish();
      router.push('/');
      return;
    }
    const cur = SCENES[step];
    const target = SCENES[next];
    if (cur.route !== target.route) {
      expecting.current = target.route;
      router.push(target.route === '/today' ? '/today?tour=1' : '/');
    }
    setStep(next);
  }, [step, finish, router]);

  const goBack = useCallback(() => {
    const prev = step - 1;
    if (prev < 0) return;
    const cur = SCENES[step];
    const target = SCENES[prev];
    if (cur.route !== target.route) {
      expecting.current = target.route;
      router.push(target.route === '/today' ? '/today?tour=1' : '/');
    }
    setStep(prev);
  }, [step, router]);

  const skip = useCallback(() => {
    const onToday = pathname === '/today';
    finish();
    if (onToday) router.push('/');
  }, [finish, pathname, router]);

  if (!mounted || !active || !scene) return null;
  if (pathname !== scene.route) return null; // hide briefly during nav

  const onHome = scene.route === '/';
  const isLast = step === SCENES.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: 'none' }}>
      {/* Home scrim focuses attention on the ghost. /today stays readable. */}
      <div
        className={`absolute inset-0 ${onHome ? 'bg-bg/85 backdrop-blur-sm' : 'bg-transparent'}`}
        style={{ pointerEvents: onHome ? 'auto' : 'none' }}
        aria-hidden
      />

      {box && (
        <div
          className="absolute rounded-md border-2 border-signal-orange animate-tour-pulse"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            pointerEvents: 'none',
          }}
        />
      )}

      {scene.ghost && (
        <div
          className="absolute left-1/2 top-[38%] w-[min(24rem,88vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 shadow-xl space-y-3"
          style={{ pointerEvents: 'none' }}
        >
          <div className="flex items-center gap-3 text-small font-mono text-ink-2">
            <StatusDot tone={ghostTone} />
            <span>{ghostLabel}</span>
          </div>
          {showTranscript && (
            <p className="text-body text-ink leading-snug">
              &ldquo;{scene.ghost.transcript}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Caption — lives above the step bar. */}
      <div className="absolute left-1/2 bottom-24 -translate-x-1/2 w-[min(28rem,90vw)] text-center">
        <div className="rounded-full border border-line bg-surface px-4 py-2 text-small font-mono text-ink-2 shadow-lg">
          {scene.caption}
        </div>
      </div>

      {cursor.visible && (
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${cursor.x - 13}px, ${cursor.y - 13}px)`,
            transition: reduced.current ? 'none' : 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
          }}
        >
          <div className="h-[26px] w-[26px] rounded-full border-2 border-ink bg-ink/10" />
        </div>
      )}

      {/* Step bar: back · counter · next. User drives pacing. */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-line bg-surface px-2 py-1.5 shadow-lg"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={goBack}
          disabled={step === 0}
          className="text-small font-mono text-ink-2 disabled:text-ink-3 disabled:cursor-not-allowed hover:text-ink px-3 py-1"
        >
          ‹ back
        </button>
        <span className="text-micro font-mono text-ink-3 px-1">
          {step + 1} / {SCENES.length}
        </span>
        <button
          onClick={goNext}
          className="text-small font-mono bg-accent text-accent-fg rounded-full px-4 py-1 hover:opacity-90"
        >
          {isLast ? 'done' : 'next ›'}
        </button>
      </div>

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
