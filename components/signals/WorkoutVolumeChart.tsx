'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { WeeklyWorkoutVolume } from '@/lib/signals/aggregate';

interface Props {
  data: WeeklyWorkoutVolume[];
}

const COLORS: Record<keyof Omit<WeeklyWorkoutVolume, 'week_start'>, string> = {
  chest: '#171717',
  back: '#6B6660',
  legs: '#B8D4C2',
  shoulders: '#D4C5E8',
  arms: '#F4C5B3',
  core: '#A8A29E',
  full_body: '#EAB308',
  other: '#EAE5DC',
};

export function WorkoutVolumeChart({ data }: Props) {
  return (
    <div className="rounded-2xl bg-surface shadow-soft p-5">
      <header className="mb-3">
        <h3 className="text-h3">Workout volume / week</h3>
        <p className="text-micro text-ink-3 font-mono">Exercises per muscle group, stacked.</p>
      </header>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="week_start"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {(['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body', 'other'] as const).map(
            (k) => (
              <Bar key={k} dataKey={k} stackId="a" fill={COLORS[k]} />
            ),
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortDate(s: string): string {
  const [_, m, d] = s.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  return `${month} ${Number(d)}`;
}
