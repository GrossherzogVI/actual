import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { listAccounts } from '../../core/api/finance-api';
import type { Account } from '../../core/types/finance';
import { AmountDisplay } from './AmountDisplay';

type AccountPanelProps = {
  selectedAccountId?: string;
  onSelectAccount: (id: string | undefined) => void;
};

const TYPE_ICONS: Record<Account['type'], typeof Building2> = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
  cash: Wallet,
  investment: TrendingUp,
};

const TYPE_LABELS: Record<Account['type'], string> = {
  checking: 'Girokonto',
  savings: 'Sparkonto',
  credit: 'Kreditkarte',
  cash: 'Bargeld',
  investment: 'Depot',
};

const TYPE_ORDER: Account['type'][] = [
  'checking',
  'savings',
  'credit',
  'cash',
  'investment',
];

function groupByType(accounts: Account[]) {
  const groups = new Map<Account['type'], Account[]>();
  for (const type of TYPE_ORDER) {
    groups.set(type, []);
  }
  for (const account of accounts) {
    const list = groups.get(account.type);
    if (list) list.push(account);
  }
  return groups;
}

export function AccountPanel({
  selectedAccountId,
  onSelectAccount,
}: AccountPanelProps) {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  });

  if (isLoading) {
    return (
      <section className="fo-panel">
        <header className="fo-panel-header">
          <h2>Konten</h2>
        </header>
        <div className="fo-stack">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  const list = accounts ?? [];
  const totalBalance = list.reduce((sum, a) => sum + a.balance, 0);
  const grouped = groupByType(list);

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Konten</h2>
      </header>

      <button
        type="button"
        className={`fo-card cursor-pointer ${!selectedAccountId ? 'border-[var(--fo-info)]' : ''}`}
        onClick={() => onSelectAccount(undefined)}
      >
        <div className="fo-space-between">
          <strong className="text-sm">Alle Konten</strong>
          <AmountDisplay amount={totalBalance} size="md" />
        </div>
      </button>

      <div className="fo-stack">
        {TYPE_ORDER.map(type => {
          const typeAccounts = grouped.get(type) ?? [];
          if (typeAccounts.length === 0) return null;

          const Icon = TYPE_ICONS[type];
          return (
            <div key={type} className="fo-stack">
              <div className="fo-row">
                <Icon size={14} className="text-[var(--fo-muted)]" />
                <small className="text-[var(--fo-muted)] text-xs uppercase tracking-wider font-medium">
                  {TYPE_LABELS[type]}
                </small>
              </div>
              {typeAccounts.map(account => (
                <button
                  key={account.id}
                  type="button"
                  className={`fo-card cursor-pointer text-left ${selectedAccountId === account.id ? 'border-[var(--fo-info)]' : ''}`}
                  onClick={() => onSelectAccount(account.id)}
                >
                  <div className="fo-space-between">
                    <span className="text-sm">{account.name}</span>
                    <AmountDisplay amount={account.balance} size="sm" />
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
