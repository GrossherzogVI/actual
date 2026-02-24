import { useCallback, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
} from 'lucide-react';

import { listCategories, listTransactions } from '../../core/api/finance-api';
import type { Category, Transaction } from '../../core/types/finance';
import { AmountDisplay } from './AmountDisplay';

type TransactionListProps = {
  accountId?: string;
  categoryId?: string;
};

type SortField = 'date' | 'amount' | 'payee';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function TransactionList({
  accountId,
  categoryId,
}: TransactionListProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', accountId, categoryId, search, page],
    queryFn: () =>
      listTransactions({
        accountId,
        categoryId,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        start: page * PAGE_SIZE,
      }),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  // Category map used as fallback when record link traversal didn't resolve
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories ?? []) {
      map.set(String(cat.id), cat);
    }
    return map;
  }, [categories]);

  const sorted = useMemo(() => {
    const list = [...(transactions ?? [])];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        cmp = a.date.localeCompare(b.date);
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount;
      } else if (sortField === 'payee') {
        cmp = (a.payee ?? '').localeCompare(b.payee ?? '');
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [transactions, sortField, sortDir]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
    },
    [sortField],
  );

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ArrowDownUp size={12} className="text-[var(--fo-muted)] opacity-50" />;
    return sortDir === 'desc' ? (
      <ChevronDown size={12} className="text-[var(--fo-info)]" />
    ) : (
      <ChevronUp size={12} className="text-[var(--fo-info)]" />
    );
  }

  if (isLoading && page === 0) {
    return (
      <section className="fo-panel">
        <header className="fo-panel-header">
          <h2>Transaktionen</h2>
        </header>
        <div className="fo-stack">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <div className="fo-space-between">
          <h2>Transaktionen</h2>
          <small className="text-[var(--fo-muted)]">
            {sorted.length} Einträge
          </small>
        </div>
      </header>

      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fo-muted)]"
        />
        <input
          type="text"
          className="fo-input pl-8"
          placeholder="Suchen nach Empfänger oder Notizen..."
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {sorted.length === 0 ? (
        <div className="fo-card text-center py-8">
          <Filter size={24} className="mx-auto mb-2 text-[var(--fo-muted)]" />
          <p className="text-sm text-[var(--fo-muted)]">
            Keine Transaktionen gefunden.
          </p>
          <small className="text-[var(--fo-muted)]">
            Importiere Bankdaten oder erstelle eine neue Transaktion.
          </small>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="grid grid-cols-[100px_1fr_1fr_120px_60px] gap-2 px-2 text-xs text-[var(--fo-muted)] uppercase tracking-wider font-medium">
            <button
              type="button"
              className="fo-row"
              onClick={() => toggleSort('date')}
            >
              Datum <SortIcon field="date" />
            </button>
            <button
              type="button"
              className="fo-row"
              onClick={() => toggleSort('payee')}
            >
              Empfänger <SortIcon field="payee" />
            </button>
            <span>Kategorie</span>
            <button
              type="button"
              className="fo-row justify-end"
              onClick={() => toggleSort('amount')}
            >
              Betrag <SortIcon field="amount" />
            </button>
            <span className="text-center">Status</span>
          </div>

          {/* Transaction rows */}
          <div className="fo-stack" style={{ maxHeight: 600, overflow: 'auto' }}>
            {sorted.map(txn => (
              <TransactionRow
                key={txn.id}
                txn={txn}
                categoryMap={categoryMap}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="fo-row justify-center">
            {page > 0 && (
              <button
                type="button"
                className="fo-chip"
                onClick={() => setPage(p => p - 1)}
              >
                Zurück
              </button>
            )}
            <small className="text-[var(--fo-muted)]">
              Seite {page + 1}
            </small>
            {(transactions?.length ?? 0) >= PAGE_SIZE && (
              <button
                type="button"
                className="fo-chip"
                onClick={() => setPage(p => p + 1)}
              >
                Weiter
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function TransactionRow({
  txn,
  categoryMap,
}: {
  txn: Transaction;
  categoryMap: Map<string, Category>;
}) {
  // Prefer resolved names from record link traversal, fall back to map lookup
  const categoryName = txn.category_name ?? (txn.category ? categoryMap.get(String(txn.category))?.name : undefined);
  const categoryColor = txn.category ? categoryMap.get(String(txn.category))?.color : undefined;
  const displayPayee = txn.payee_name ?? txn.notes ?? '-';

  return (
    <div className="grid grid-cols-[100px_1fr_1fr_120px_60px] gap-2 items-center px-2 py-2 rounded-md hover:bg-[rgba(255,255,255,0.02)] transition-colors">
      <span className="text-xs text-[var(--fo-muted)] font-mono">
        {formatDate(txn.date)}
      </span>
      <div className="min-w-0">
        <span className="text-sm truncate block">
          {displayPayee}
        </span>
        {txn.notes && txn.payee_name && (
          <small className="text-[var(--fo-muted)] text-xs truncate block">
            {txn.notes}
          </small>
        )}
      </div>
      <div className="fo-row">
        {categoryColor && (
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: categoryColor }}
          />
        )}
        <span className="text-xs text-[var(--fo-muted)] truncate">
          {categoryName ?? '-'}
        </span>
      </div>
      <div className="text-right">
        <AmountDisplay amount={txn.amount} size="sm" />
      </div>
      <div className="flex justify-center">
        {txn.cleared && (
          <Check size={14} className="text-emerald-400" />
        )}
      </div>
    </div>
  );
}
