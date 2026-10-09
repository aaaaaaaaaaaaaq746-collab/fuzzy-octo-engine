import { BookOpenCheck } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-icon"><BookOpenCheck size={19} strokeWidth={2.2} aria-hidden="true" /></span>
      <span className="brand-wordmark">pagewise<span className="brand-period">.</span></span>
    </span>
  );
}
