'use client';

import { useEffect, useRef, useState } from 'react';
import { Circle, Square } from 'lucide-react';

type State = 'idle' | 'launching' | 'recording';

interface Props {
  autoLaunch?: boolean;
  // Fire-and-forget; the caller drives its own status UI so the mic is
  // free immediately after stop.
  onRecorded: (blob: Blob, mimeType: string, durationMs: number) => void;
}

export function RecordButton({ autoLaunch = false, onRecorded }: Props) {
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
    if (state === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        stopStreams();
        const duration = Date.now() - startTimeRef.current;
        setState('idle');
        setElapsedMs(0);
        // Background — caller manages transcribe/parse status separately.
        onRecorded(blob, rec.mimeType, duration);
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

  const isRecording = state === 'recording';

  return (
    <button
      onClick={isRecording ? stop : start}
      className={[
        'w-full h-16 rounded text-body font-medium flex items-center justify-center gap-3 select-none transition-colors',
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
        {isRecording ? `stop · ${formatTime(elapsedMs)}` : 'tap to record'}
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
