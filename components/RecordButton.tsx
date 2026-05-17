'use client';

import { useEffect, useRef, useState } from 'react';
import { Circle, Square } from 'lucide-react';

type State = 'idle' | 'launching' | 'recording' | 'transcribing';

interface Props {
  autoLaunch?: boolean;
  onRecorded: (blob: Blob, mimeType: string, durationMs: number) => Promise<void> | void;
  onTranscribingChange?: (active: boolean) => void;
}

export function RecordButton({ autoLaunch = false, onRecorded, onTranscribingChange }: Props) {
  const [state, setState] = useState<State>(autoLaunch ? 'launching' : 'idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (state === 'launching') {
      const t = setTimeout(() => setState('idle'), 1500);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    if (state !== 'recording') return;
    startTimeRef.current = Date.now();
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state]);

  async function start() {
    if (state === 'recording' || state === 'transcribing') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        stopStreams();
        const duration = Date.now() - startTimeRef.current;
        setState('transcribing');
        onTranscribingChange?.(true);
        try {
          await onRecorded(blob, rec.mimeType, duration);
        } finally {
          onTranscribingChange?.(false);
          setState('idle');
          setElapsedMs(0);
        }
      };
      recorderRef.current = rec;
      rec.start();

      // Silence detection -> auto stop after 60s of low volume.
      setupSilenceDetection(stream);

      setState('recording');
    } catch (err) {
      console.error('mic error', err);
      alert('microphone permission denied. tap settings → safari → microphone.');
      setState('idle');
    }
  }

  function stop() {
    if (state !== 'recording') return;
    recorderRef.current?.stop();
  }

  function stopStreams() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function setupSilenceDetection(stream: MediaStream) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    let lastSpeechAt = Date.now();
    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      let max = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128);
        if (v > max) max = v;
      }
      if (max > 8) lastSpeechAt = Date.now();
      if (Date.now() - lastSpeechAt > 60_000) {
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  const isLaunching = state === 'launching';
  const isRecording = state === 'recording';
  const isTranscribing = state === 'transcribing';

  return (
    <button
      onClick={isRecording ? stop : start}
      disabled={isTranscribing}
      className={[
        'w-full h-16 rounded text-body font-medium flex items-center justify-center gap-3 select-none transition-colors',
        isLaunching && 'bg-[#EAB308] text-black animate-launch-pulse',
        isRecording && 'bg-signal-red text-white animate-record-pulse',
        isTranscribing && 'bg-line text-ink-2 cursor-wait',
        !isLaunching && !isRecording && !isTranscribing && 'bg-[#EAB308] text-black',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isRecording ? <Square size={18} fill="currentColor" /> : <Circle size={18} fill="currentColor" />}
      <span className="font-mono">
        {isLaunching && 'tap to record'}
        {isRecording && `stop · ${formatTime(elapsedMs)}`}
        {isTranscribing && 'transcribing…'}
        {state === 'idle' && 'record'}
      </span>
    </button>
  );
}

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}
