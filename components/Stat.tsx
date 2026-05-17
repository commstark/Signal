interface Props {
  value: string;
  label: string;
  meta?: string;
}

export function Stat({ value, label, meta }: Props) {
  return (
    <div className="border border-line rounded p-4 bg-surface h-full flex flex-col">
      <div className="text-h1 font-mono font-medium">{value}</div>
      <div className="text-small text-ink-2 mt-1">{label}</div>
      <div className="text-micro text-ink-3 mt-1 font-mono min-h-[1em]">{meta ?? ''}</div>
    </div>
  );
}
