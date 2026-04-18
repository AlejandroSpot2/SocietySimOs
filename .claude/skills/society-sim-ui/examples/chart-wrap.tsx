import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { chartColors, brutalAxis, brutalGrid } from '../theme/charts';
import { personaColorList } from '../theme/personas';

// --- Custom tooltip -------------------------------------------------
export function BrutalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-black border border-[var(--color-accent)] px-[10px] py-[8px]"
      style={{ fontFamily: 'Geist', fontVariantNumeric: 'tabular-nums' }}
    >
      {label != null && (
        <div className="text-[9px] font-bold tracking-[0.08em] text-[var(--color-accent)] uppercase mb-[6px]">
          {label}
        </div>
      )}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-[8px] text-[10px] tracking-[0.04em]">
          <span className="w-[6px] h-[6px]" style={{ background: p.color }} />
          <span className="text-[var(--color-text-dim)]">{p.name}</span>
          <span className="text-white font-bold ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// --- Frame ----------------------------------------------------------
interface ChartFrameProps {
  title: string;
  timeframe?: string;
  featured?: boolean;
  children: React.ReactNode;
  height?: number;
}

export function ChartFrame({ title, timeframe, featured, children, height = 220 }: ChartFrameProps) {
  const topBorder = featured ? 'border-t-2 border-t-[var(--color-accent)]' : '';
  return (
    <div className={`bg-[var(--color-surface)] border border-[var(--color-border)] ${topBorder}`}>
      <div className="px-[18px] pt-[14px] pb-[10px] flex justify-between items-center">
        <div className="text-[11px] font-bold text-white tracking-[0.02em]">{title}</div>
        {timeframe && (
          <div className="text-[9px] text-[var(--color-text-mute)] tracking-[0.06em] uppercase">{timeframe}</div>
        )}
      </div>
      <div className="px-[12px] pb-[14px]" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Bar (e.g. per-persona sentiment) -------------------------------
export function BrutalBar({ data, xKey, yKey }: { data: any[]; xKey: string; yKey: string }) {
  return (
    <BarChart data={data} barCategoryGap={6}>
      <CartesianGrid {...brutalGrid} />
      <XAxis dataKey={xKey} {...brutalAxis} />
      <YAxis {...brutalAxis} />
      <Tooltip content={<BrutalTooltip />} cursor={{ fill: '#1a1a1a' }} />
      <Bar dataKey={yKey} isAnimationActive={false}>
        {data.map((_, i) => (
          <Cell key={i} fill={personaColorList[i % personaColorList.length]} />
        ))}
      </Bar>
    </BarChart>
  );
}

// --- Line (e.g. sentiment over turns) -------------------------------
export function BrutalLine({ data, xKey, series }: { data: any[]; xKey: string; series: { key: string; name: string; focal?: boolean }[] }) {
  return (
    <LineChart data={data}>
      <CartesianGrid {...brutalGrid} />
      <XAxis dataKey={xKey} {...brutalAxis} />
      <YAxis {...brutalAxis} />
      <Tooltip content={<BrutalTooltip />} cursor={{ stroke: '#333', strokeDasharray: '2 2' }} />
      {series.map((s, i) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={s.focal ? chartColors.focal : chartColors.context[i % chartColors.context.length]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: s.focal ? chartColors.focal : '#fff' }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}

// --- Scatter (persuasion vs passion per persona) --------------------
export function BrutalScatter({ data }: { data: { id: string; x: number; y: number; name: string; color: string }[] }) {
  return (
    <ScatterChart>
      <CartesianGrid {...brutalGrid} />
      <XAxis type="number" dataKey="x" name="Persuasion" domain={[-1, 1]} {...brutalAxis} />
      <YAxis type="number" dataKey="y" name="Passion" domain={[-1, 1]} {...brutalAxis} />
      <ReferenceLine x={0} stroke={chartColors.hero} strokeDasharray="2 2" strokeWidth={1} />
      <ReferenceLine y={0} stroke={chartColors.hero} strokeDasharray="2 2" strokeWidth={1} />
      <Tooltip content={<BrutalTooltip />} cursor={{ stroke: '#333', strokeDasharray: '2 2' }} />
      <Scatter data={data} shape="square" isAnimationActive={false}>
        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
      </Scatter>
    </ScatterChart>
  );
}
