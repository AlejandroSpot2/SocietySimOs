import type { ReactNode } from 'react';

interface Props {
  title: string;
  timeframe?: string;
  featured?: boolean;
  children: ReactNode;
  height?: number | string;
}

export function ChartFrame({ title, timeframe, featured, children, height = 220 }: Props) {
  return (
    <div
      className={`bg-[var(--color-sso-surface)] border border-[var(--color-sso-border)] ${
        featured ? 'border-t-2 border-t-[var(--color-sso-accent)]' : ''
      }`}
    >
      <div className="px-[18px] pt-[14px] pb-[10px] flex justify-between items-center">
        <div className="text-[11px] font-bold text-white tracking-[0.02em] uppercase">{title}</div>
        {timeframe && (
          <div className="text-[9px] text-[var(--color-sso-text-mute)] tracking-[0.06em] uppercase">
            {timeframe}
          </div>
        )}
      </div>
      <div className="px-[12px] pb-[14px]" style={{ height }}>
        {children}
      </div>
    </div>
  );
}
