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
  // 'idle' shows the saved transcript; 'editing' triggers the typing animation.
  mode: 'idle' | 'editing';
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

// User-driven walkthrough. Each scene = one click (or one tap anywhere on the
// page). The only things that auto-play inside a scene are the dot vocabulary
// in the parse scene and the typing animation in the active edit scene —
// both are what the scene is teaching.
const SCENES: Scene[] = [
  {
    route: '/',
    caption: 'Tap the yellow button to start recording.',
    highlightTarget: 'record-button',
  },
  {
    route: '/',
    caption: 'Now you’re recording. Say something like — “Two scoops of whey and a turkey sandwich.” (food)',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'Or a workout — “Benched 225 for six, three sets.”',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'Or supplements — “Took my morning vitamin stack.”',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'Or a calibration — “From now on a glass is 295ml.” (We use it forever after.)',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'Tap the red button to stop when you’re done.',
    fauxButton: 'recording',
  },
  {
    route: '/',
    caption: 'We transcribe, parse, and tag what you said.',
    fauxButton: 'idle',
    ghost: {
      intent: 'food',
      transcript: 'Two scoops of whey and a turkey sandwich.',
      playSequence: true,
    },
  },
  {
    route: '/',
    caption: 'Got something wrong? Tap the transcript to edit.',
    fauxEditor: {
      initial: 'Two scoops of whey and a turkey sandwich.',
      edit: { from: 'turkey', to: 'ham' },
      mode: 'idle',
    },
  },
  {
    route: '/',
    caption: 'We’ll re-parse to update your numbers.',
    fauxEditor: {
      initial: 'Two scoops of whey and a turkey sandwich.',
      edit: { from: 'turkey', to: 'ham' },
      mode: 'editing',
    },
  },
  {
    route: '/',
    caption: 'Now it lives in Today. Tap to see how it adds up.',
    highlightTarget: 'today-link',
  },
  {
    route: '/today',
    caption: 'Today — your day, totaled.',
    scrollTo: 'top',
  },
  {
    route: '/today',
    caption: 'Tap any tile to see the breakdown.',
    highlightTarget: 'tile-protein',
  },
  {
    route: '/today',
    caption: 'Every gram traced back to what you ate. Water, carbs, fiber, and sugar all work the same.',
    fauxBreakdown: { field: 'protein_g', label: 'Protein', value: '76g' },
  },
  {
    route: '/today',
    caption: 'Workouts roll up here — sets, top set, duration.',
    scrollTo: 'workouts',
    highlightTarget: 'workouts',
  },
  {
    route: '/today',
    caption: 'And your log — every entry, with the transcript you said. Tap one to edit if it’s off.',
    scrollTo: 'log',
    highlightTarget: 'log',
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
      const intentTitle =
        scene.ghost.intent.charAt(0).toUpperCase() + scene.ghost.intent.slice(1);
      if (scene.ghost.playSequence && !reduced.current) {
        setGhostTone('progress');
        setGhostLabel('Transcribing…');
        setShowTranscript(false);
        timers.current.push(
          setTimeout(() => {
            setGhostTone('progress');
            setGhostLabel('Parsing…');
          }, 1300),
        );
        timers.current.push(
          setTimeout(() => {
            setGhostTone('done');
            setGhostLabel(`Done · ${intentTitle}`);
            setShowTranscript(true);
          }, 2700),
        );
      } else {
        setGhostTone('done');
        setGhostLabel(`Done · ${intentTitle}`);
        setShowTranscript(true);
      }
    }

    // Edit scenes: idle shows the saved transcript; editing replays the
    // animation slowly so the user actually sees the correction happen.
    if (scene.fauxEditor) {
      const { initial, edit, mode } = scene.fauxEditor;
      setEditText(initial);
      setEditorMode(mode);

      if (mode === 'editing') {
        const start = initial.indexOf(edit.from);
        if (start >= 0) {
          const before = initial.slice(0, start);
          const after = initial.slice(start + edit.from.length);
          let delay = reduced.current ? 100 : 700;
          const charMs = reduced.current ? 8 : 130; // slowed from 75ms
          for (let i = edit.from.length - 1; i >= 0; i--) {
            const snapshot = before + edit.from.slice(0, i) + after;
            timers.current.push(setTimeout(() => setEditText(snapshot), delay));
            delay += charMs;
          }
          delay += reduced.current ? 50 : 350; // clear pause between delete and retype
          for (let i = 1; i <= edit.to.length; i++) {
            const snapshot = before + edit.to.slice(0, i) + after;
            timers.current.push(setTimeout(() => setEditText(snapshot), delay));
            delay += charMs;
          }
          // Stay in editing mode — user clicks Next when ready.
        }
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
      // Breakdown modal eats the bottom half on mobile — always put the
      // caption at top so they don't overlap.
      if (scene.fauxBreakdown) {
        setBox(null);
        setCaptionTop(true);
        return;
      }
      if (scene.highlightTarget) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${scene.highlightTarget}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          setBox({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
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

  const isLast = step === SCENES.length - 1;
  const isRecording = scene.fauxButton === 'recording';

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: 'none' }}>
      {/* Scrim: barely-there fuzz so the page stays readable beneath. The
         entire scrim is a giant Next button — tap anywhere advances. */}
      <div
        className={`absolute inset-0 ${
          scene.fauxBreakdown ? 'bg-black/35 backdrop-blur-[2px]' : 'bg-black/8 backdrop-blur-[1px]'
        }`}
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        onClick={goNext}
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

      {/* Voice waveform — only while recording. Reads as "we're listening." */}
      {isRecording && buttonRect && <VoiceWaves buttonRect={buttonRect} />}

      {/* Ghost capture row — positioned where the real CaptureRow appears
         (right below the record button), so users see the actual layout. */}
      {scene.ghost && buttonRect && (
        <div
          className="absolute rounded-2xl bg-surface p-4 shadow-soft space-y-2"
          style={{
            left: buttonRect.x,
            top: buttonRect.y + buttonRect.h + 16,
            width: buttonRect.w,
            pointerEvents: 'none',
          }}
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
          className="absolute left-1/2 top-[32%] w-[min(26rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-5 shadow-soft-lg space-y-2"
          style={{ pointerEvents: 'none' }}
        >
          <p className="text-micro text-ink-3 uppercase tracking-wide">Latest transcript</p>
          {editorMode === 'editing' ? (
            <div className="space-y-2">
              <div className="w-full p-4 bg-surface border border-ink rounded-xl text-body min-h-[3rem]">
                {editText}
                <span className="inline-block w-[2px] h-[1em] bg-ink ml-0.5 align-middle animate-tour-pulse" />
              </div>
              <span className="inline-flex h-10 px-4 items-center bg-accent text-accent-fg rounded-xl text-small font-semibold">
                Done · re-parse
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-body text-ink">{editText}</div>
              <span className="text-micro text-ink-3">Re-parse</span>
            </div>
          )}
        </div>
      )}

      {scene.fauxBreakdown && (
        <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4 pb-36 sm:pb-4 pointer-events-none">
          <div
            className="w-full max-w-md bg-surface rounded-3xl p-6 space-y-3 shadow-soft-lg pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-h3">{scene.fauxBreakdown.label}</h3>
              <span className="text-small text-ink-2 font-mono tabular-nums">
                {scene.fauxBreakdown.value}
              </span>
            </div>
            <ul className="space-y-2">
              {breakdown.map((r) => (
                <li
                  key={r.key}
                  className="flex items-baseline justify-between gap-3 border-l-2 border-line pl-3"
                >
                  <span className="text-small text-ink truncate">{r.name}</span>
                  <span className="text-small font-mono text-ink shrink-0 tabular-nums">
                    {Math.round((r.protein_g ?? 0) * 10) / 10}g
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div
        className={`absolute left-1/2 -translate-x-1/2 w-[min(28rem,90vw)] text-center pointer-events-none ${
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
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={goBack}
          disabled={step === 0}
          className="text-micro font-mono text-ink-2 disabled:text-ink-3 disabled:cursor-not-allowed hover:text-ink px-2.5 py-1 whitespace-nowrap"
        >
          ‹ Back
        </button>
        <span className="text-micro font-mono text-ink-3 px-1 whitespace-nowrap tabular-nums">
          {step + 1} / {SCENES.length}
        </span>
        <button
          onClick={goNext}
          className="text-micro font-mono bg-accent text-accent-fg rounded-full px-3 py-1 hover:opacity-90 whitespace-nowrap"
        >
          {isLast ? 'Done' : 'Next ›'}
        </button>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        className="absolute top-4 right-4 text-micro font-mono text-ink-3 hover:text-ink underline underline-offset-4"
        style={{ pointerEvents: 'auto' }}
      >
        Skip
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
        {isRecording ? `Stop · ${mm}:${ss}` : 'Tap to record'}
      </span>
    </div>
  );
}

// Animated red bars above the recording button — reads as "we're listening,
// keep talking." Different per-bar animation delays produce a waveform feel.
function VoiceWaves({ buttonRect }: { buttonRect: Box }) {
  const delays = ['0ms', '120ms', '240ms', '120ms', '0ms'];
  return (
    <div
      className="absolute flex items-center gap-1.5"
      style={{
        left: buttonRect.x + buttonRect.w / 2,
        top: buttonRect.y - 40,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
      }}
    >
      {delays.map((delay, i) => (
        <span
          key={i}
          className="block w-1.5 h-6 bg-signal-red rounded-full animate-tour-wave origin-center"
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  );
}
