import React from 'react';
import { personaColors } from '../theme/personas';

type Status = 'RUNNING' | 'QUEUED' | 'PAUSED' | 'LIVE';

const statusStyle: Record<Status, string> = {
  RUNNING: 'bg-[var(--color-accent)] text-[#0a0a0a]',
  LIVE:    'bg-[var(--color-ok)] text-[#052e16]',
  QUEUED:  'border border-[#333] text-[#555]',
  PAUSED:  'border border-[var(--color-border)] text-[var(--color-text-mute)]',
};

interface AgentRowProps {
  personaId: string;
  name: string;
  subtitle: string;
  channel: string;
  leads?: number | null;
  conv?: number | null;
  revenue?: string | null;
  status: Status;
  featured?: boolean;
}

export function AgentRow({
  personaId, name, subtitle, channel, leads, conv, revenue, status, featured,
}: AgentRowProps) {
  const isIdle = status === 'QUEUED' || status === 'PAUSED';
  const baseBg = featured ? 'bg-[#131300]' : 'bg-transparent';
  const hoverBg = featured ? 'hover:bg-[#1a1900]' : 'hover:bg-[#141414]';
  const opacity = status === 'PAUSED' ? 'opacity-40' : status === 'QUEUED' ? 'opacity-50' : '';

  const nameColor = featured
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text)]';

  return (
    <div
      className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] px-[18px] py-3 border-b border-[var(--color-border-soft)] cursor-pointer ${baseBg} ${hoverBg} ${opacity}`}
      style={{ borderLeft: `2px solid ${personaColors[personaId] ?? 'transparent'}` }}
    >
      <div>
        <div className={`text-[12px] font-bold tracking-[-0.02em] ${nameColor}`}>{name}</div>
        <div className="text-[10px] text-[var(--color-text-mute)] mt-[2px]">{subtitle}</div>
      </div>
      <div className="flex items-center text-[11px] text-[var(--color-text-dim)]">{channel}</div>
      <div className="flex items-center text-[13px] font-bold text-[var(--color-text)]">
        {isIdle && leads == null ? <span className="text-[var(--color-text-mute)]">—</span> : (leads?.toLocaleString() ?? '—')}
      </div>
      <div className={`flex items-center text-[13px] font-bold ${featured ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
        {isIdle && conv == null ? <span className="text-[var(--color-text-mute)]">—</span> : (conv != null ? `${conv}%` : '—')}
      </div>
      <div className="flex items-center text-[13px] font-bold text-[var(--color-text)]">
        {isIdle && revenue == null ? <span className="text-[var(--color-text-mute)]">—</span> : (revenue ?? '—')}
      </div>
      <div className="flex items-center">
        <span className={`text-[8px] font-black tracking-[0.08em] px-[7px] py-[3px] ${statusStyle[status]}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
