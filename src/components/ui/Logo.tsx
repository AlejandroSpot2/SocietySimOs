import { Users } from 'lucide-react';

interface Props {
  size?: 'sm' | 'md';
}

export function Logo({ size = 'sm' }: Props) {
  const isMd = size === 'md';
  const iconBox = isMd ? 'w-9 h-9' : 'w-7 h-7';
  const iconSize = isMd ? 20 : 16;
  const wordmark = isMd ? 'text-[18px]' : 'text-[13px]';
  const tag = isMd ? 'w-[22px] h-[22px] text-[12px]' : 'w-[16px] h-[16px] text-[9px]';

  return (
    <div className="flex items-center gap-[8px] select-none">
      <div
        className={`${iconBox} bg-[#00e5ff] flex items-center justify-center border-2 border-[#0a0a0a]`}
        style={{ boxShadow: '2px 2px 0 0 #f5f500' }}
      >
        <Users size={iconSize} strokeWidth={2.5} color="#0a0a0a" />
      </div>
      <div className={`flex items-center gap-[4px] ${wordmark}`}>
        <span className="font-black tracking-[-0.04em] leading-none text-white">
          SOCIETY<span className="text-[#00e5ff]">SIM</span>
        </span>
        <span
          className={`bg-[#f5f500] text-[#0a0a0a] font-black leading-none flex items-center justify-center ${tag}`}
        >
          OS
        </span>
      </div>
    </div>
  );
}
