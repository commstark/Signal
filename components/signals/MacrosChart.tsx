'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import type { MacroDay, InterventionMarker } from '@/lib/signals/aggregate';

interface Props {
  data: MacroDay[];
  interventions: InterventionMarker[];
}

const COLORS = {
  protein_g: '#171717',     // ink — primary
  calories_kcal: '#A8A29E', // ink-3 — muted (different scale)
  carbs_g: '#B8D4C2',       // mint
  sugar_g: '#F4C5B3',       // peach (ceiling-flavored)
  fiber_g: '#D4C5E8',       // lilac
};

export function MacrosChart({ data, interventions }: Props) {
  return (
    <div className="rounded-2xl bg-surface shadow-soft p-5">
      <header className="mb-3">
        <h3 className="text-h3">Macros</h3>
        <p className="text-micro text-ink-3 font-mono">
          Daily totals. Vertical lines mark interventions starting.
        </p>
      </header>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(v) => String(v)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {interventions.map((iv, i) => (
            <ReferenceLine
              key={i}
              x={iv.date}
              stroke="var(--ink-3)"
              strokeDasharray="3 3"
              label={{ value: iv.name, position: 'top', fontSize: 10, fill: 'var(--ink-2)' }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="protein_g"
            name="protein"
            stroke={COLORS.protein_g}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="carbs_g"
            name="carbs"
            stroke={COLORS.carbs_g}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="sugar_g"
            name="sugar"
            stroke={COLORS.sugar_g}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="fiber_g"
            name="fiber"
            stroke={COLORS.fiber_g}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortDate(s: string): string {
  // s = YYYY-MM-DD → "May 3"
  const [_, m, d] = s.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  return `${month} ${Number(d)}`;
}
