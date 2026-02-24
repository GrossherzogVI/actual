import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';

import { listAccounts } from '../../core/api/finance-api';
import type { Account } from '../../core/types/finance';
import { AmountDisplay } from '../finance/AmountDisplay';

const TYPE_ICONS: Record<Account['type'], typeof Landmark> = {
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

export function AccountBalancesWidget() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  });

  if (isLoading) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <header className="fo-panel-header">
          <h2>Konten</h2>
        </header>
        <div className="h-8 rounded-md bg-[var(--fo-bg)] animate-pulse" />
        <div className="fo-stack">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </motion.section>
    );
  }

  const list = accounts ?? [];
  const totalBalance = list.reduce((sum, a) => sum + a.balance, 0);
  const grouped = groupByType(list);

  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05 }}
    >
      <header className="fo-panel-header">
        <h2>Konten</h2>
      </header>

      <div className="fo-card">
        <div className="fo-space-between">
          <span className="text-xs uppercase tracking-wider text-[var(--fo-muted)] font-medium">
            Gesamtsaldo
          </span>
          <AmountDisplay amount={totalBalance} size="lg" />
        </div>
      </div>

      <div className="fo-stack">
        {TYPE_ORDER.map(type => {
          const typeAccounts = grouped.get(type) ?? [];
          if (typeAccounts.length === 0) return null;

          const Icon = TYPE_ICONS[type];
          return (
            <div key={type} className="fo-stack">
              <div className="fo-row">
                <Icon size={13} className="text-[var(--fo-muted)]" />
                <small className="text-[var(--fo-muted)] text-xs uppercase tracking-wider font-medium">
                  {TYPE_LABELS[type]}
                </small>
              </div>
              {typeAccounts.map(account => (
                <div key={account.id} className="fo-space-between px-1">
                  <span className="text-sm text-[var(--fo-text)]">
                    {account.name}
                  </span>
                  <AmountDisplay amount={account.balance} size="sm" />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
