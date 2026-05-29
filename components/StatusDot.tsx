// One status vocabulary, used on the recording screen and /today so users
// learn the colors once: orange (pulsing) = working, green = done,
// amber = partial, red = failed, grey = idle/queued.
export type StatusTone = 'progress' | 'done' | 'warn' | 'error' | 'idle';

const toneClass: Record<StatusTone, string> = {
  progress: 'bg-signal-orange animate-dot-pulse',
  done: 'bg-signal-green',
  warn: 'bg-yellow-500',
  error: 'bg-signal-red',
  idle: 'bg-ink-2',
};

export function StatusDot({
  tone,
  label,
  className = '',
}: {
  tone: StatusTone;
  // Screen-reader text; the dot itself is decorative reinforcement.
  label?: string;
  className?: string;
}) {
  return (
    <span
      title={label}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${toneClass[tone]} ${className}`}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
