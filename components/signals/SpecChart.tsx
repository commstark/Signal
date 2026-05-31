'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { RenderedChartData } from '@/lib/signals/spec';

interface Props {
  data: RenderedChartData;
}

// Constrained chart renderer. Maps a {kind, x, y, ...} spec to a recharts
// component. The model never gets to write rendering code — it only
// writes a spec, we draw it.
export function SpecChart({ data }: Props) {
  const { spec, points, interventions } = data;

  return (
    <div className="rounded-2xl bg-surface shadow-soft p-5">
      <header className="mb-3">
        <h3 className="text-h3">{spec.title}</h3>
        {spec.caption && <p className="text-micro text-ink-3 font-mono">{spec.caption}</p>}
      </header>
      <ResponsiveContainer width="100%" height={220}>
        {renderInner(data)}
      </ResponsiveContainer>
    </div>
  );

  function renderInner(d: RenderedChartData) {
    const common = { margin: { top: 8, right: 16, bottom: 0, left: -20 } } as const;
    const tooltipStyle = {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      fontSize: 12,
    };

    if (d.spec.kind === 'line') {
      return (
        <LineChart data={d.points} {...common}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            tickFormatter={shortDate}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          {interventions?.map((iv, i) => (
            <ReferenceLine
              key={i}
              x={iv.date}
              stroke="var(--ink-3)"
              strokeDasharray="3 3"
              label={{ value: iv.name, position: 'top', fontSize: 10, fill: 'var(--ink-2)' }}
            />
          ))}
          <Line type="monotone" dataKey="value" stroke="var(--ink)" strokeWidth={2} dot={false} />
        </LineChart>
      );
    }

    if (d.spec.kind === 'bar') {
      return (
        <BarChart data={d.points} {...common}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            tickFormatter={shortDate}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="var(--ink)" />
        </BarChart>
      );
    }

    if (d.spec.kind === 'scatter') {
      return (
        <ScatterChart {...common}>
          <XAxis
            dataKey="x"
            type="number"
            name={d.spec.x.label ?? d.spec.x.metric}
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            name={d.spec.y.label ?? d.spec.y.metric}
            tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={d.points} fill="var(--ink)" />
        </ScatterChart>
      );
    }

    // group_compare
    return (
      <BarChart data={d.points} {...common}>
        <XAxis
          dataKey="group"
          tick={{ fontSize: 11, fill: 'var(--ink-3)' }}
          axisLine={{ stroke: 'var(--line)' }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="mean" fill="var(--ink)" />
      </BarChart>
    );
  }
}

function shortDate(s: string | number): string {
  const str = String(s);
  if (!str.includes('-')) return str;
  const [, m, d] = str.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  return `${month} ${Number(d)}`;
}
