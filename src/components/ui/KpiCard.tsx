import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  value: ReactNode;
  delta?: ReactNode;
  variant?: 'hero' | 'default';
  deltaTone?: 'ok' | 'warn' | 'danger' | 'muted';
}

export function KpiCard({ eyebrow, value, delta, variant = 'default', deltaTone = 'ok' }: Props) {
  const isHero = variant === 'hero';
  const bg = isHero ? 'bg-[var(--color-sso-accent)]' : 'bg-[var(--color-sso-surface)]';
  const border = isHero ? '' : 'border border-[var(--color-sso-border)]';
  const eyebrowCls = isHero ? 'text-[var(--color-sso-accent-dim)]' : 'text-[var(--color-sso-text-mute)]';
  const valueCls = isHero ? 'text-[#0a0a0a]' : 'text-white';

  const deltaCls = isHero
    ? 'text-[var(--color-sso-accent-dim)]'
    : deltaTone === 'ok'
      ? 'text-[var(--color-sso-ok)]'
      : deltaTone === 'warn'
        ? 'text-[var(--color-sso-warn)]'
        : deltaTone === 'danger'
          ? 'text-[var(--color-sso-danger)]'
          : 'text-[var(--color-sso-text-dim)]';

  return (
    <div className={`${bg} ${border} p-[18px]`}>
      <div className={`text-[9px] font-bold tracking-[0.10em] mb-2 uppercase ${eyebrowCls}`}>
        {eyebrow}
      </div>
      <div className={`text-[36px] font-black leading-none tracking-[-0.05em] tabular-nums ${valueCls}`}>
        {value}
      </div>
      {delta && <div className={`text-[10px] font-medium mt-[6px] ${deltaCls}`}>{delta}</div>}
    </div>
  );
}
