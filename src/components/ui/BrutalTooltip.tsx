interface Payload {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

interface Props {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
}

export function BrutalTooltip({ active, payload, label }: Props) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-[var(--color-sso-accent)] px-[10px] py-[8px] font-sans">
      {label != null && (
        <div className="text-[9px] font-bold tracking-[0.08em] text-[var(--color-sso-accent)] uppercase mb-[6px]">
          {label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={p.dataKey ?? i} className="flex items-center gap-[8px] text-[10px] tracking-[0.04em]">
          <span className="w-[6px] h-[6px] inline-block" style={{ background: p.color ?? '#fff' }} />
          {p.name && <span className="text-[var(--color-sso-text-dim)]">{p.name}</span>}
          <span className="text-white font-bold ml-auto tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
