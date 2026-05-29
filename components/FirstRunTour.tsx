'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Circle, Square } from 'lucide-react';
import { StatusDot, type StatusTone } from '@/components/StatusDot';
import { demoTodayData } from '@/lib/demo';
import type { NutritionBreakdownRow } from '@/lib/today';

const SEEN_KEY = 'signal.tourSeen';

type Route = '/' | '/today';

interface FauxEditor {
  initial: string;
  edit: { from: string; to: string };
}

interface FauxBreakdown {
  field: 'protein_g';
  label: string;
  value: string;
}

interface Scene {
  route: Route;
  caption: string;
  highlightTarget?: string;
  scrollTo?: string | 'top';
  fauxButton?: 'idle' | 'recording';
  ghost?: { intent: string; transcript: string; playSequence?: boolean };
  fauxEditor?: FauxEditor;
  fauxBreakdown?: FauxBreakdown;
}

// 14-scene user-driven walkthrough. Each scene = one click. The only things
// that auto-play inside a scene are the dot vocabulary in the parse scene
// and the typing animation in the edit scene — both are what the scene is
// teaching.
const SCENES: Scene[] = [
  {
    route: '/',
    caption: 'tap the yellow button to start recording.',
    highlightTarget: 'record-button',
  },
  {
    route: '/',
    caption: 'now you’re recording. say something like — “two scoops of whey and a turkey sandwich.” (food)',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'or a workout — “benched 225 for six, three sets.”',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'or supplements — “took my morning vitamin stack.”',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'or a calibration — “from now on a glass is 295ml.” (we use it forever after.)',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'tap the red button to stop when you’re done.',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'we transcribe, parse, and tag what you said.',
    fauxButton: 'idle',
    ghost: {
      intent: 'food',
      transcript: 'two scoops of whey and a turkey sandwich.',
      playSequence: true,
    },
  },
  {
    route: '/',
    caption: 'got something wrong? tap the transcript to edit — we’ll re-parse the numbers.',
    fauxEditor: {
      initial: 'two scoops of whey and a turkey sandwich.',
      edit: { from: 'turkey', to: 'ham' },
    },
  },
  {
    route: '/',
    caption: 'now it lives in today. tap to see how it adds up.',
    highlightTarget: 'today-link',
  },
  {
    route: '/today',
    caption: 'today — your day, totaled.',
    scrollTo: 'top',
  },
  {
    route: '/today',
    caption: 'tap any tile to see the breakdown.',
    highlightTarget: 'tile-protein',
  },
  {
    route: '/today',
    caption: 'every gram traced back to what you ate. water, carbs, fiber, and sugar all work the same.',
    fauxBreakdown: { field: 'protein_g', label: 'protein', value: '76g' },
  },
  {
    route: '/today',
    caption: 'workouts roll up here — sets, top set, duration.',
    scrollTo: 'workouts',
    highlightTarget: 'workouts',
  },
  {
    route: '/today',
    caption: 'tap back any time to keep logging.',
    scrollTo: 'top',
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

  const [buttonRect, setButtonRect] = useState<Box | null>(null);
  const [recordingSecs, setRecordingSecs] = useState(0);

  const [ghostTone, setGhostTone] = useState<StatusTone>('done');
  const [ghostLabel, setGhostLabel] = useState<string>('');
  const [showTranscript, setShowTranscript] = useState(true);

  const [editText, setEditText] = useState<string>('');
  const [editorMode, setEditorMode] = useState<'idle' | 'editing'>('idle');

  const [box, setBox] = useState<Box | null>(null);
  const [captionTop, setCaptionTop] = useState(false);

  const reduced = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const expecting = useRef<Route | null>(null);
  const recordingStartedAt = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    setMounted(true);
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

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
    setButtonRect(null);
    recordingStartedAt.current = null;
  }, [clearTimers]);

  const scene = SCENES[step];

  // Keep the faux record button aligned with the real one through scroll/resize.
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>('[data-tour="record-button"]');
      if (el) {
        const r = el.getBoundingClientRect();
        setButtonRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      } else {
        setButtonRect(null);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, pathname]);

  // Recording timer: resets on entering a recording group; persists across
  // consecutive recording scenes so it reads as one continuous take.
  useEffect(() => {
    if (!active) return;
    const isRecording = scene?.fauxButton === 'recording';
    if (!isRecording) {
      recordingStartedAt.current = null;
      setRecordingSecs(0);
      return;
    }
    if (recordingStartedAt.current === null) recordingStartedAt.current = Date.now();
    const tick = () => {
      if (recordingStartedAt.current === null) return;
      setRecordingSecs(Math.floor((Date.now() - recordingStartedAt.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, scene]);

  // Per-scene setup: ghost vocabulary, edit animation, scroll + highlight.
  useEffect(() => {
    if (!active || !scene) return;
    if (pathname !== scene.route) return;
    clearTimers();

    if (scene.ghost) {
      if (scene.ghost.playSequence && !reduced.current) {
        setGhostTone('progress');
        setGhostLabel('transcribing…');
        setShowTranscript(false);
        timers.current.push(
          setTimeout(() => {
            setGhostTone('progress');
            setGhostLabel('parsing…');
          }, 1300),
        );
        timers.current.push(
          setTimeout(() => {
            setGhostTone('done');
            setGhostLabel(`done · ${scene.ghost!.intent}`);
            setShowTranscript(true);
          }, 2700),
        );
      } else {
        setGhostTone('done');
        setGhostLabel(`done · ${scene.ghost.intent}`);
        setShowTranscript(true);
      }
    }

    if (scene.fauxEditor) {
      const { initial, edit } = scene.fauxEditor;
      setEditText(initial);
      setEditorMode('idle');
      timers.current.push(
        setTimeout(() => setEditorMode('editing'), reduced.current ? 50 : 700),
      );
      const start = initial.indexOf(edit.from);
      if (start >= 0) {
        const before = initial.slice(0, start);
        const after = initial.slice(start + edit.from.length);
        let delay = reduced.current ? 100 : 1400;
        const charMs = reduced.current ? 8 : 75;
        for (let i = edit.from.length - 1; i >= 0; i--) {
          const snapshot = before + edit.from.slice(0, i) + after;
          timers.current.push(setTimeout(() => setEditText(snapshot), delay));
          delay += charMs;
        }
        delay += reduced.current ? 50 : 200;
        for (let i = 1; i <= edit.to.length; i++) {
          const snapshot = before + edit.to.slice(0, i) + after;
          timers.current.push(setTimeout(() => setEditText(snapshot), delay));
          delay += charMs;
        }
        timers.current.push(
          setTimeout(() => setEditorMode('idle'), delay + (reduced.current ? 100 : 700)),
        );
      }
    }

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

    const compute = () => {
      if (scene.highlightTarget) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${scene.highlightTarget}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          setBox({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
          // Flip caption to top if the highlight is in the bottom half — the
          // default-bottom caption would otherwise cover what we're pointing at.
          setCaptionTop(r.top + r.height / 2 > window.innerHeight * 0.55);
        } else {
          setBox(null);
          setCaptionTop(false);
        }
      } else {
        setBox(null);
        setCaptionTop(false);
      }
    };
    if (scene.scrollTo && !reduced.current) {
      timers.current.push(setTimeout(compute, 500));
    } else {
      compute();
    }

    return clearTimers;
  }, [active, scene, pathname, clearTimers]);

  // End the tour gracefully if the user navigates away on their own.
  useEffect(() => {
    if (!active || !scene) return;
    if (expecting.current && pathname === expecting.current) {
      expecting.current = null;
      return;
    }
    if (expecting.current === null && pathname !== scene.route) {
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

  const breakdown = useMemo<NutritionBreakdownRow[]>(() => {
    if (!scene?.fauxBreakdown) return [];
    const field = scene.fauxBreakdown.field;
    return demoTodayData().breakdown.filter((r) => {
      const v = r[field];
      return v != null && v > 0;
    });
  }, [scene]);

  if (!mounted || !active || !scene) return null;
  if (pathname !== scene.route) return null;

  const onHome = scene.route === '/';
  const isLast = step === SCENES.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: 'none' }}>
      <div
        className={`absolute inset-0 ${
          scene.fauxBreakdown
            ? 'bg-black/50 backdrop-blur-sm'
            : onHome
            ? 'bg-black/20 backdrop-blur-md'
            : 'bg-transparent'
        }`}
        style={{ pointerEvents: onHome || scene.fauxBreakdown ? 'auto' : 'none' }}
        aria-hidden
      />

      {box && !scene.fauxBreakdown && (
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

      {scene.fauxButton && buttonRect && (
        <div
          className="absolute"
          style={{
            left: buttonRect.x,
            top: buttonRect.y,
            width: buttonRect.w,
            height: buttonRect.h,
            pointerEvents: 'none',
          }}
        >
          <FauxRecordButton state={scene.fauxButton} secs={recordingSecs} />
        </div>
      )}

      {scene.ghost && (
        <div
          className="absolute left-1/2 top-[34%] w-[min(24rem,88vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-5 shadow-soft-lg space-y-3"
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

      {scene.fauxEditor && (
        <div
          className="absolute left-1/2 top-[34%] w-[min(26rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-5 shadow-soft-lg space-y-2"
          style={{ pointerEvents: 'none' }}
        >
          <p className="text-micro text-ink-3 uppercase tracking-wide">latest transcript</p>
          {editorMode === 'editing' ? (
            <div className="space-y-2">
              <div className="w-full p-4 bg-surface border border-ink rounded-xl text-body min-h-[3rem]">
                {editText}
                <span className="inline-block w-[2px] h-[1em] bg-ink ml-0.5 align-middle animate-tour-pulse" />
              </div>
              <span className="inline-flex h-10 px-4 items-center bg-accent text-accent-fg rounded-xl text-small font-semibold">
                done · re-parse
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-body text-ink">{editText}</div>
              <span className="text-micro text-ink-3 font-mono">re-parse</span>
            </div>
          )}
        </div>
      )}

      {scene.fauxBreakdown && (
        <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4 pb-36 sm:pb-4">
          <div
            className="w-full max-w-md bg-surface rounded-3xl p-6 space-y-3 shadow-soft-lg"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-h3">{scene.fauxBreakdown.label}</h3>
              <span className="text-small text-ink-2 font-mono">{scene.fauxBreakdown.value}</span>
            </div>
            <ul className="space-y-2">
              {breakdown.map((r) => (
                <li
                  key={r.key}
                  className="flex items-baseline justify-between gap-3 border-l-2 border-line pl-3"
                >
                  <span className="text-small text-ink truncate">{r.name}</span>
                  <span className="text-small font-mono text-ink shrink-0">
                    {Math.round((r.protein_g ?? 0) * 10) / 10}g
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div
        className={`absolute left-1/2 -translate-x-1/2 w-[min(28rem,90vw)] text-center ${
          captionTop ? 'top-20' : 'bottom-24'
        }`}
      >
        <div className="rounded-2xl bg-surface px-5 py-3 text-small text-ink shadow-soft-lg leading-snug">
          {scene.caption}
        </div>
      </div>

      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[calc(100vw-1.5rem)] flex items-center gap-1 rounded-full bg-surface px-1.5 py-1 shadow-soft-lg"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={goBack}
          disabled={step === 0}
          className="text-micro font-mono text-ink-2 disabled:text-ink-3 disabled:cursor-not-allowed hover:text-ink px-2.5 py-1 whitespace-nowrap"
        >
          ‹ back
        </button>
        <span className="text-micro font-mono text-ink-3 px-1 whitespace-nowrap tabular-nums">
          {step + 1} / {SCENES.length}
        </span>
        <button
          onClick={goNext}
          className="text-micro font-mono bg-accent text-accent-fg rounded-full px-3 py-1 hover:opacity-90 whitespace-nowrap"
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

// Pixel-matched to components/RecordButton.tsx so the overlay is
// indistinguishable from the real button while the tour drives state.
function FauxRecordButton({ state, secs }: { state: 'idle' | 'recording'; secs: number }) {
  const isRecording = state === 'recording';
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <div
      className={[
        'w-full h-full rounded-2xl text-body font-semibold flex items-center justify-center gap-3 select-none transition-colors shadow-soft',
        isRecording
          ? 'bg-signal-red text-white animate-record-pulse'
          : 'bg-[#EAB308] text-black',
      ].join(' ')}
    >
      {isRecording ? (
        <Square size={18} fill="currentColor" />
      ) : (
        <Circle size={18} fill="currentColor" className="animate-dot-pulse" />
      )}
      <span className="font-mono">
        {isRecording ? `stop · ${mm}:${ss}` : 'tap to record'}
      </span>
    </div>
  );
}
