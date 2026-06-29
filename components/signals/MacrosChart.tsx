'use client';

import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { MacroDay, InterventionMarker } from '@/lib/signals/aggregate';
import type { Targets } from '@/lib/targets';

interface Props {
  data: MacroDay[];
  interventions: InterventionMarker[];
  targets: Targets;
}

// Five small charts — one per macro — each showing the daily total
// against the user's goal or ceiling. Replaces the old single-line
// chart where four series shared one Y-axis: protein and fiber sat
// under sugar, the calorie scale dwarfed everything, and a missed-goal
// day didn't read at a glance. Now each chart has its own scale and the
// goal sits as a dashed reference line so you can see streaks vs misses.
export function MacrosChart({ data, interventions, targets }: Props) {
  return (
    <div className="rounded-2xl bg-surface shadow-soft p-5">
      <header className="mb-4">
        <h3 className="text-h3">Macros</h3>
        <p className="text-micro text-ink-3 font-mono">
          Daily totals vs. your target. Dashed line = goal (or ceiling for sugar). Vertical lines mark interventions.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MacroPanel
          title="Protein"
          unit="g"
          data={data}
          dataKey="protein_g"
          target={targets.protein_g}
          targetLabel="floor"
          tone="goal"
          interventions={interventions}
        />
        <MacroPanel
          title="Calories"
          unit="kcal"
          data={data}
          dataKey="calories_kcal"
          target={targets.calories_kcal}
          targetLabel="target"
          tone="goal"
          interventions={interventions}
        />
        <MacroPanel
          title="Carbs"
          unit="g"
          data={data}
          dataKey="carbs_g"
          target={targets.carbs_g}
          targetLabel="floor"
          tone="goal"
          interventions={interventions}
        />
        <MacroPanel
          title="Fiber"
          unit="g"
          data={data}
          dataKey="fiber_g"
          target={targets.fiber_g}
          targetLabel="floor"
          tone="goal"
          interventions={interventions}
        />
        <div className="sm:col-span-2">
          <MacroPanel
            title="Sugar"
            unit="g"
            data={data}
            dataKey="sugar_g"
            target={targets.sugar_g_ceiling}
            targetLabel="ceiling"
            tone="ceiling"
            interventions={interventions}
          />
        </div>
      </div>
    </div>
  );
}

interface PanelProps {
  title: string;
  unit: string;
  data: MacroDay[];
  dataKey: keyof Omit<MacroDay, 'date'>;
  target: number;
  targetLabel: 'floor' | 'ceiling' | 'target';
  tone: 'goal' | 'ceiling';
  interventions: InterventionMarker[];
}

function MacroPanel({
  title,
  unit,
  data,
  dataKey,
  target,
  targetLabel,
  tone,
  interventions,
}: PanelProps) {
  // Track-record summary so the panel reads even before the chart resolves.
  const hits = data.filter((d) => isOnTarget(d[dataKey] as number, target, tone)).length;
  const total = data.length;
  const lineColor = tone === 'ceiling' ? 'var(--peach)' : 'var(--ink)';
  // Soft fill under the line — peach when it's a ceiling, lilac when it's a goal.
  const fillColor = tone === 'ceiling' ? 'var(--peach)' : 'var(--lilac)';
  // Compute a sensible Y-axis ceiling so the goal line is always visible
  // even on days where the user blew past it (or didn't come close).
  const maxValue = Math.max(...data.map((d) => Number(d[dataKey] ?? 0)), target);
  const yMax = Math.ceil((maxValue * 1.1) / 10) * 10;

  return (
    <div className="border border-line rounded-xl p-3">
      <header className="mb-1 flex items-baseline justify-between">
        <div>
          <div className="text-small font-medium">{title}</div>
          <div className="text-micro text-ink-3 font-mono">
            {targetLabel} {target}
            {unit}
          </div>
        </div>
        <div className="text-right">
          <div className="text-small tabular-nums font-mono">
            <span className={hits === total ? 'text-signal-green' : 'text-ink'}>{hits}</span>
            <span className="text-ink-3"> / {total}</span>
          </div>
          <div className="text-micro text-ink-3 font-mono uppercase tracking-wide">
            {tone === 'ceiling' ? 'under' : 'on target'}
          </div>
        </div>
      </header>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity={0.55} />
              <stop offset="100%" stopColor={fillColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 10, fill: 'var(--ink-3)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 10, fill: 'var(--ink-3)' }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value) => [`${Number(value ?? 0)}${unit}`, title.toLowerCase()]}
            labelFormatter={(v) => String(v)}
          />
          <ReferenceLine
            y={target}
            stroke={lineColor}
            strokeDasharray="4 3"
            strokeOpacity={0.6}
          />
          {interventions.map((iv, i) => (
            <ReferenceLine
              key={i}
              x={iv.date}
              stroke="var(--ink-3)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
          ))}
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#fill-${dataKey})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function isOnTarget(value: number, target: number, tone: 'goal' | 'ceiling'): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  return tone === 'ceiling' ? value <= target : value >= target;
}

function shortDate(s: string): string {
  // s = YYYY-MM-DD -> "May 3"
  const [, m, d] = s.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  return `${month} ${Number(d)}`;
}
