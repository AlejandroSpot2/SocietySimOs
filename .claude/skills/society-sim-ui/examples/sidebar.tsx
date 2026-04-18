import React from 'react';

interface NavItemProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavItem({ label, active, onClick }: NavItemProps) {
  if (active) {
    return (
      <div
        className="bg-[var(--color-accent)] px-4 py-[9px] flex items-center gap-[10px] cursor-pointer"
        onClick={onClick}
      >
        <div className="w-[5px] h-[5px] bg-[#0a0a0a]" />
        <span className="text-[11px] font-bold text-[#0a0a0a] tracking-[0.03em]">{label}</span>
      </div>
    );
  }
  return (
    <div
      className="px-4 py-[9px] flex items-center gap-[10px] cursor-pointer hover:bg-[#141414]"
      onClick={onClick}
    >
      <div className="w-[5px] h-[5px] border-[1.5px] border-[#333]" />
      <span className="text-[11px] font-normal text-[#555] tracking-[0.03em]">{label}</span>
    </div>
  );
}

interface SidebarProps {
  build: string;
  active: string;
  items: { id: string; label: string }[];
  liveCount?: number;
  workspace?: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ build, active, items, liveCount = 0, workspace, onSelect }: SidebarProps) {
  return (
    <div className="w-[180px] shrink-0 bg-[var(--color-bg)] border-r-2 border-[var(--color-border)] flex flex-col">
      <div className="px-4 pt-[18px] pb-4 border-b-2 border-[var(--color-accent)]">
        <div className="text-[15px] font-black text-[var(--color-accent)] leading-none tracking-[-0.04em]">
          SOCIETY<br />SIM/OS
        </div>
        <div className="text-[9px] text-[var(--color-text-mute)] tracking-[0.1em] mt-1 font-medium">
          BUILD {build}
        </div>
      </div>

      <nav className="py-3 flex-1">
        {items.map(it => (
          <NavItem key={it.id} label={it.label} active={it.id === active} onClick={() => onSelect(it.id)} />
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-[7px] mb-[10px]">
          <div className="w-[6px] h-[6px] rounded-full bg-[var(--color-ok)]" />
          <span className="text-[10px] text-[var(--color-text-mute)] font-medium">
            {liveCount} agents live
          </span>
        </div>
        {workspace && (
          <div className="border border-[var(--color-border)] px-[10px] py-2">
            <div className="text-[9px] text-[var(--color-text-mute)] tracking-[0.06em] mb-[2px]">
              WORKSPACE
            </div>
            <div className="text-[11px] text-[var(--color-text-dim)] font-medium">{workspace}</div>
          </div>
        )}
      </div>
    </div>
  );
}
