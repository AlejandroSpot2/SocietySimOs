import React from 'react';

interface KpiCardProps {
  eyebrow: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  variant?: 'hero' | 'default';
  deltaTone?: 'ok' | 'warn' | 'muted';
}

export function KpiCard({ eyebrow, value, delta, variant = 'default', deltaTone = 'ok' }: KpiCardProps) {
  const isHero = variant === 'hero';

  const bg = isHero ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface)]';
  const border = isHero ? '' : 'border border-[var(--color-border)]';
  const eyebrowColor = isHero ? 'text-[var(--color-accent-dim)]' : 'text-[var(--color-text-mute)]';
  const valueColor = isHero ? 'text-[#0a0a0a]' : 'text-[var(--color-text)]';
  const deltaColor =
    isHero ? 'text-[var(--color-accent-dim)]'
    : deltaTone === 'ok' ? 'text-[var(--color-ok)]'
    : deltaTone === 'warn' ? 'text-[var(--color-warn)]'
    : 'text-[var(--color-text-dim)]';

  return (
    <div className={`${bg} ${border} p-[18px]`}>
      <div className={`text-[9px] font-bold tracking-[0.10em] mb-2 ${eyebrowColor}`}>
        {eyebrow.toUpperCase()}
      </div>
      <div className={`text-[36px] font-black leading-none tracking-[-0.05em] ${valueColor}`}>
        {value}
      </div>
      {delta && (
        <div className={`text-[10px] font-medium mt-[6px] ${deltaColor}`}>
          {delta}
        </div>
      )}
    </div>
  );
}
