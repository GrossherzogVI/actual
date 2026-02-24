import {
  Calendar,
  Clock,
  RefreshCw,
  Shield,
  Zap,
  CreditCard,
  Users,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

import type { Contract } from '../../core/types/finance';
import { AmountDisplay } from '../finance/AmountDisplay';

type ContractCardProps = {
  contract: Contract;
  onEdit: (contract: Contract) => void;
};

const HEALTH_CONFIG: Record<
  Contract['health'],
  { label: string; color: string; bg: string; border: string }
> = {
  green: {
    label: 'Aktiv',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  yellow: {
    label: 'Ablauf nahe',
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  red: {
    label: 'Dringend',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  grey: {
    label: 'Gekuendigt',
    color: '#a6a6a6',
    bg: 'rgba(166, 166, 166, 0.08)',
    border: 'rgba(166, 166, 166, 0.25)',
  },
};

const TYPE_CONFIG: Record<Contract['type'], { label: string; icon: LucideIcon }> = {
  subscription: { label: 'Abo', icon: RefreshCw },
  insurance: { label: 'Versicherung', icon: Shield },
  utility: { label: 'Versorger', icon: Zap },
  loan: { label: 'Kredit', icon: CreditCard },
  membership: { label: 'Mitgliedschaft', icon: Users },
  other: { label: 'Sonstiges', icon: MoreHorizontal },
};

const INTERVAL_LABELS: Record<Contract['interval'], string> = {
  weekly: 'woechentlich',
  monthly: 'monatlich',
  quarterly: 'vierteljaehrlich',
  'semi-annual': 'halbjaehrlich',
  annual: 'jaehrlich',
  custom: 'individuell',
};

const INTERVAL_SHORT: Record<Contract['interval'], string> = {
  weekly: '/Woche',
  monthly: '/Monat',
  quarterly: '/Quartal',
  'semi-annual': '/Halbjahr',
  annual: '/Jahr',
  custom: '',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function getNoticeDaysRemaining(endDate: string): number | null {
  try {
    const end = new Date(endDate);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export function ContractCard({ contract, onEdit }: ContractCardProps) {
  const health = HEALTH_CONFIG[contract.health];
  const typeInfo = TYPE_CONFIG[contract.type];
  const TypeIcon = typeInfo.icon;

  const noticeDays = contract.end_date
    ? getNoticeDaysRemaining(contract.end_date)
    : null;

  return (
    <button
      type="button"
      className="fo-card text-left cursor-pointer"
      onClick={() => onEdit(contract)}
    >
      {/* Top row: health badge + type badge */}
      <div className="fo-space-between">
        <div className="fo-row">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: health.color }}
            title={health.label}
          />
          <span
            className="text-xs font-medium"
            style={{ color: health.color }}
          >
            {health.label}
          </span>
        </div>
        <span
          className="fo-row text-xs font-medium px-2 py-0.5 rounded"
          style={{
            color: 'var(--fo-muted)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--fo-border)',
            gap: 4,
          }}
        >
          <TypeIcon size={11} />
          {typeInfo.label}
        </span>
      </div>

      {/* Name + provider */}
      <div>
        <div className="text-sm font-medium truncate">{contract.name}</div>
        <div className="text-xs text-[var(--fo-muted)] truncate">
          {contract.provider}
        </div>
      </div>

      {/* Amount + interval */}
      <div className="fo-space-between">
        <div>
          <span className="text-sm font-semibold tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(contract.amount)}
          </span>
          <span className="text-xs text-[var(--fo-muted)]">
            {INTERVAL_SHORT[contract.interval]}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--fo-muted)]">
            {formatCurrency(contract.annual_cost)}/Jahr
          </div>
        </div>
      </div>

      {/* Notice period countdown */}
      {noticeDays !== null && noticeDays > 0 && contract.health !== 'grey' && (
        <div
          className="fo-row text-xs px-2 py-1 rounded"
          style={{
            background: noticeDays <= 30 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            color: noticeDays <= 30 ? '#f87171' : '#fbbf24',
            gap: 4,
          }}
        >
          <Clock size={11} />
          Kuendigung in {noticeDays} Tagen
        </div>
      )}

      {/* Bottom row: interval + auto-renewal */}
      <div className="fo-row text-xs text-[var(--fo-muted)]" style={{ gap: 12 }}>
        <span className="fo-row" style={{ gap: 4 }}>
          <Calendar size={11} />
          {INTERVAL_LABELS[contract.interval]}
        </span>
        {contract.auto_renewal && (
          <span className="fo-row" style={{ gap: 4 }}>
            <RefreshCw size={11} />
            Auto-Verl.
          </span>
        )}
      </div>
    </button>
  );
}

export { HEALTH_CONFIG, TYPE_CONFIG, INTERVAL_LABELS };
