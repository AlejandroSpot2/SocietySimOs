type Status = 'RUNNING' | 'LIVE' | 'QUEUED' | 'PAUSED' | 'READY' | 'ERROR' | 'OFFLINE';

const styles: Record<Status, string> = {
  RUNNING: 'bg-[var(--color-sso-accent)] text-[#0a0a0a]',
  LIVE: 'bg-[var(--color-sso-ok)] text-[#052e16]',
  READY: 'bg-[var(--color-sso-accent-2)] text-[#002b2e]',
  QUEUED: 'border border-[#333] text-[#666]',
  PAUSED: 'border border-[var(--color-sso-border)] text-[var(--color-sso-text-mute)]',
  ERROR: 'bg-[var(--color-sso-danger)] text-[#1a0000]',
  OFFLINE: 'border border-[var(--color-sso-border)] text-[var(--color-sso-text-mute)]',
};

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className={`text-[8px] font-black tracking-[0.08em] px-[7px] py-[3px] uppercase ${styles[status]}`}
    >
      {label ?? status}
    </span>
  );
}
