interface Props {
  value: string;
  label: string;
  meta?: string;
  // 0..1+ — fraction of daily target reached. >1 = overshoot.
  progress?: number;
  // 'goal' fills toward 100% with lilac (you want to reach it).
  // 'ceiling' fills toward 100% with peach (you want to stay under it).
  tone?: 'goal' | 'ceiling';
}

// Diagonal fill: bottom-right corner is the anchor; as progress grows, the
// color sweeps up-and-to-the-left across the tile. A soft 6% edge keeps the
// fill from looking like a hard slice. Tones map to existing palette tokens
// (lilac for goals, peach for ceilings) via inline rgb-with-alpha so we get
// transparent stops without redefining colors.
export function Stat({ value, label, meta, progress, tone = 'goal' }: Props) {
  const clamped = progress != null ? Math.min(Math.max(progress, 0), 1) : null;
  const overshoot = progress != null && progress > 1;
  const rgb = tone === 'ceiling' ? '244, 197, 179' : '212, 197, 232';
  const pct = clamped != null ? clamped * 100 : 0;
  const softEnd = Math.min(100, pct + 6);
  const background =
    clamped != null && clamped > 0
      ? `linear-gradient(to top left, rgb(${rgb} / 0.7) 0%, rgb(${rgb} / 0.7) ${pct}%, rgb(${rgb} / 0) ${softEnd}%, rgb(${rgb} / 0) 100%)`
      : undefined;

  return (
    <div className="rounded-2xl bg-surface shadow-soft h-full relative overflow-hidden">
      {background && (
        <div className="absolute inset-0 pointer-events-none" style={{ background }} aria-hidden />
      )}
      <div className="relative p-5 h-full flex flex-col">
        <div className="text-h1 font-semibold tabular-nums flex items-baseline gap-1">
          <span>{value}</span>
          {overshoot && <span className="text-small text-ink-2">↑</span>}
        </div>
        <div className="text-small text-ink-2 mt-1.5">{label}</div>
        <div className="text-micro text-ink-3 mt-1 font-mono min-h-[1em]">{meta ?? ''}</div>
      </div>
    </div>
  );
}
