// @ts-strict-ignore
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { ContractHealthBadge } from './ContractHealthBadge';
import { ContractSummaryCard } from './ContractSummaryCard';
import { useContracts } from './hooks/useContracts';
import {
  CONTRACT_INTERVAL_OPTIONS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_OPTIONS,
  formatAmountEur,
  isDeadlineSoon,
} from './types';
import type { ContractEntity } from './types';

import { EmptyState } from '@desktop-client/components/common/EmptyState';
import { Search } from '@desktop-client/components/common/Search';
import { SkeletonList } from '@desktop-client/components/common/Skeleton';
import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TableHeader as ShadcnTableHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/ui/table';

// '' means "all"
type StatusFilter =
  | ''
  | 'active'
  | 'expiring'
  | 'cancelled'
  | 'paused'
  | 'discovered';
type TypeFilter = '' | string;
export type CostView = 'monthly' | 'annual';

// Pre-suggested tags (German context)
const SUGGESTED_TAGS = ['Urlaub', 'Steuerlich relevant', 'Geteilt', 'Einmalig'];

const INTERVAL_LABELS: Record<string, string> = Object.fromEntries(
  CONTRACT_INTERVAL_OPTIONS,
);

const DE_DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDateDE(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return DE_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

/** Compute the display amount for a contract given the chosen cost view. */
function displayAmount(
  contract: ContractEntity,
  costView: CostView,
): number | null {
  if (contract.amount == null) return null;
  if (costView === 'annual') {
    if (contract.annual_cost != null) return contract.annual_cost;
    const INTERVAL_MULTIPLIERS: Record<string, number> = {
      weekly: 52,
      monthly: 12,
      quarterly: 4,
      'semi-annual': 2,
      annual: 1,
    };
    const mult = INTERVAL_MULTIPLIERS[contract.interval] ?? 12;
    return contract.amount * mult;
  }
  return contract.amount;
}

const DAYS_BY_INTERVAL: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  'semi-annual': 182,
  annual: 365,
};

function computeCostPerDay(contract: ContractEntity): number | null {
  if (contract.amount == null || !contract.interval) return null;
  if (contract.cost_per_day != null) return contract.cost_per_day;
  const days = DAYS_BY_INTERVAL[contract.interval];
  return days != null ? contract.amount / days : null;
}

const HEALTH_PROGRESS: Record<string, number> = {
  green: 100,
  yellow: 55,
  red: 20,
};

// ─── Selection bar ────────────────────────────────────────────────────────────

type SelectionBarProps = {
  selected: Set<string>;
  contracts: ContractEntity[];
  costView: CostView;
  onClearSelection: () => void;
  onBatchDelete: () => void;
  onBatchStatus: (status: string) => void;
};

function SelectionBar({
  selected,
  contracts,
  costView,
  onClearSelection,
  onBatchDelete,
  onBatchStatus,
}: SelectionBarProps) {
  const { t } = useTranslation();

  const totalMonthly = useMemo(() => {
    return contracts
      .filter(c => selected.has(c.id))
      .reduce((sum, c) => {
        const amt = displayAmount(c, 'monthly');
        return sum + (amt ?? 0);
      }, 0);
  }, [contracts, selected]);

  const totalAnnual = useMemo(() => {
    return contracts
      .filter(c => selected.has(c.id))
      .reduce((sum, c) => {
        const amt = displayAmount(c, 'annual');
        return sum + (amt ?? 0);
      }, 0);
  }, [contracts, selected]);

  const displayTotal = costView === 'monthly' ? totalMonthly : totalAnnual;
  const displayLabel = costView === 'monthly' ? t('month') : t('year');

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2.5 rounded-md border border-primary/25 bg-primary/5 px-4 py-2">
      <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
        {t('{{n}} selected', { n: selected.size })}
        {' — '}
        <Text style={{ fontWeight: 400 }}>
          {`€${formatAmountEur(displayTotal)}/${displayLabel}`}
        </Text>
      </Text>
      <View style={{ flex: 1 }} />
      <Button
        variant="bare"
        onPress={() => onBatchStatus('paused')}
        style={{ fontSize: 12 }}
      >
        <Trans>Set Paused</Trans>
      </Button>
      <Button
        variant="bare"
        onPress={() => onBatchStatus('cancelled')}
        style={{ fontSize: 12 }}
      >
        <Trans>Set Cancelled</Trans>
      </Button>
      <Button
        variant="bare"
        onPress={onBatchDelete}
        style={{ fontSize: 12, color: theme.errorText }}
      >
        <Trans>Delete</Trans>
      </Button>
      <Button
        variant="bare"
        onPress={onClearSelection}
        style={{ fontSize: 12 }}
      >
        <Trans>Clear</Trans>
      </Button>
    </div>
  );
}

// ─── Status badge with dot ───────────────────────────────────────────────────

function StatusDotBadge({ label, color }: { label: string; color: string }) {
  return (
    <Badge variant="outline" className="gap-1.5 capitalize">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </Badge>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ContractsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('contractManagement');
  const navigate = useNavigate();

  const statusFilterOptions = useMemo<[string, string][]>(
    () => [
      ['', t('All statuses')],
      ['active', t('Active')],
      ['expiring', t('Expiring')],
      ['cancelled', t('Cancelled')],
      ['paused', t('Paused')],
      ['discovered', t('Discovered')],
    ],
    [t],
  );

  const typeFilterOptions = useMemo<[string, string][]>(
    () => [
      ['', t('All types')],
      ...CONTRACT_TYPE_OPTIONS.map(
        ([value, label]) => [value, t(label)] as [string, string],
      ),
    ],
    [t],
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [tagFilter, setTagFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [costView, setCostView] = useState<CostView>('monthly');

  // ── Multi-select state ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickedId = useRef<string | null>(null);

  const { contracts, loading, error, updateContract, deleteContract } =
    useContracts({
      status: statusFilter || undefined,
      type: typeFilter || undefined,
    });

  const filteredContracts = useMemo(() => {
    let list = contracts;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          (c.provider && c.provider.toLowerCase().includes(q)) ||
          (c.counterparty && c.counterparty.toLowerCase().includes(q)),
      );
    }
    if (tagFilter) {
      list = list.filter(
        c => Array.isArray(c.tags) && c.tags.includes(tagFilter),
      );
    }
    return list;
  }, [contracts, searchQuery, tagFilter]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const c of contracts) {
      if (Array.isArray(c.tags)) {
        for (const tag of c.tags) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [contracts]);

  const tagFilterOptions: [string, string][] = useMemo(
    () => [
      ['', t('All tags')],
      ...allTags.map(tag => [tag, tag] as [string, string]),
    ],
    [allTags, t],
  );

  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v as StatusFilter);
  }, []);

  const handleTypeChange = useCallback((v: string) => {
    setTypeFilter(v);
  }, []);

  // ── Selection handlers ──────────────────────────────────────────────────────

  const handleSelectContract = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected(prev => {
        const next = new Set(prev);
        if (shiftKey && lastClickedId.current && lastClickedId.current !== id) {
          const ids = filteredContracts.map(c => c.id);
          const fromIdx = ids.indexOf(lastClickedId.current);
          const toIdx = ids.indexOf(id);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [start, end] =
              fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
            for (let i = start; i <= end; i++) {
              next.add(ids[i]);
            }
            return next;
          }
        }
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      lastClickedId.current = id;
    },
    [filteredContracts],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastClickedId.current = null;
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (!window.confirm(t('Delete {{n}} contract(s)?', { n: selected.size }))) {
      return;
    }
    for (const id of selected) {
      await deleteContract(id);
    }
    clearSelection();
  }, [selected, deleteContract, clearSelection, t]);

  const handleBatchStatus = useCallback(
    async (status: string) => {
      for (const id of selected) {
        await updateContract(id, {
          status: status as ContractEntity['status'],
        });
      }
      clearSelection();
    },
    [selected, updateContract, clearSelection],
  );

  const handleRowClick = useCallback(
    (contract: ContractEntity, e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-checkbox]')) return;

      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSelectContract(contract.id, e.shiftKey);
        return;
      }
      navigate(`/contracts/${contract.id}`);
    },
    [navigate, handleSelectContract],
  );

  const handleCheckboxClick = useCallback(
    (contractId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      handleSelectContract(contractId, e.shiftKey);
    },
    [handleSelectContract],
  );

  // ── Feature flag guard ──────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <Page header={t('Contracts')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t(
              'Contract management is not enabled. Enable it in Settings > Feature Flags.',
            )}
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Contracts')}>
      {/* Summary card */}
      <ContractSummaryCard costView={costView} />

      {/* Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Select
          options={statusFilterOptions}
          value={statusFilter}
          defaultLabel={t('All statuses')}
          onChange={handleStatusChange}
          style={{ minWidth: 130 }}
        />
        <Select
          options={typeFilterOptions}
          value={typeFilter}
          defaultLabel={t('All types')}
          onChange={handleTypeChange}
          style={{ minWidth: 130 }}
        />
        {allTags.length > 0 && (
          <Select
            options={tagFilterOptions}
            value={tagFilter}
            defaultLabel={t('All tags')}
            onChange={setTagFilter}
            style={{ minWidth: 120 }}
          />
        )}

        {/* Cost view toggle */}
        <View
          style={{
            flexDirection: 'row',
            gap: 0,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 5,
            overflow: 'hidden',
          }}
        >
          <CostToggleButton
            label={t('Monthly')}
            active={costView === 'monthly'}
            onPress={() => setCostView('monthly')}
          />
          <CostToggleButton
            label={t('Annual')}
            active={costView === 'annual'}
            onPress={() => setCostView('annual')}
          />
        </View>

        <View
          style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}
        >
          <Search
            placeholder={t('Filter contracts…')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </View>
      </View>

      {/* Selection bar */}
      {selected.size > 0 && (
        <SelectionBar
          selected={selected}
          contracts={filteredContracts}
          costView={costView}
          onClearSelection={clearSelection}
          onBatchDelete={handleBatchDelete}
          onBatchStatus={handleBatchStatus}
        />
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        {error ? (
          <View style={{ padding: 20 }}>
            <Text style={{ color: theme.errorText }}>
              {t('Failed to load contracts: {{error}}', { error })}
            </Text>
          </View>
        ) : loading ? (
          <View style={{ padding: '16px 20px' }}>
            <SkeletonList count={6} />
          </View>
        ) : filteredContracts.length === 0 ? (
          searchQuery || statusFilter || typeFilter || tagFilter ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text
                style={{
                  color: theme.pageTextSubdued,
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                <Trans>No contracts match the current filters.</Trans>
              </Text>
            </View>
          ) : (
            <EmptyState
              title={t('No contracts yet')}
              description={t(
                'Import your financial data to auto-discover contracts, or add one manually.',
              )}
              actions={[
                {
                  label: t('Import Data'),
                  onPress: () => navigate('/import'),
                  primary: true,
                },
                {
                  label: t('Add Contract'),
                  onPress: () => navigate('/contracts/new'),
                },
              ]}
            />
          )
        ) : (
          <Table>
            <ShadcnTableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[24px]" />
                <TableHead className="min-w-[200px]">
                  <Trans>Name</Trans>
                </TableHead>
                <TableHead><Trans>Type</Trans></TableHead>
                <TableHead className="text-right">
                  {costView === 'monthly' ? t('Monthly') : t('Annual')}
                </TableHead>
                <TableHead><Trans>Status</Trans></TableHead>
                <TableHead><Trans>Health</Trans></TableHead>
                <TableHead><Trans>Cancel deadline</Trans></TableHead>
              </TableRow>
            </ShadcnTableHeader>
            <TableBody>
              {filteredContracts.map(contract => {
                const isSelected = selected.has(contract.id);
                const deadlineSoon = isDeadlineSoon(
                  contract.cancellation_deadline,
                );
                const amt = displayAmount(contract, costView);
                const intervalLabel =
                  costView === 'annual'
                    ? t('year')
                    : (INTERVAL_LABELS[contract.interval] ?? contract.interval);

                return (
                  <TableRow
                    key={contract.id}
                    className={`cursor-pointer ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                    data-state={isSelected ? 'selected' : undefined}
                    onClick={e => handleRowClick(contract, e)}
                  >
                    {/* Checkbox */}
                    <TableCell className="w-[24px] pr-0">
                      <div
                        data-checkbox
                        onClick={e => handleCheckboxClick(contract.id, e)}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={e => e.stopPropagation()}
                          className="cursor-pointer"
                          style={{ accentColor: theme.buttonPrimaryBackground }}
                        />
                      </div>
                    </TableCell>

                    {/* Name + provider + tags */}
                    <TableCell className="min-w-[200px]">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="truncate font-medium"
                          style={{ color: theme.pageText }}
                        >
                          {contract.name}
                        </span>
                        {contract.provider && (
                          <span className="truncate text-xs text-muted-foreground">
                            {contract.provider}
                          </span>
                        )}
                        {Array.isArray(contract.tags) &&
                          contract.tags.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {contract.tags.map(tag => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                      </div>
                    </TableCell>

                    {/* Type badge */}
                    <TableCell>
                      {contract.type && (
                        <Badge variant="outline" className="capitalize">
                          {contract.type}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium tabular-nums">
                          {amt != null ? `€${formatAmountEur(amt)}` : '-'}
                        </span>
                        {intervalLabel && (
                          <span className="text-xs text-muted-foreground">
                            /{intervalLabel}
                          </span>
                        )}
                        {costView === 'monthly' &&
                          (() => {
                            const costPerDay = computeCostPerDay(contract);
                            if (costPerDay == null) return null;
                            return (
                              <span className="text-xs text-muted-foreground">
                                {`€${formatAmountEur(costPerDay)}/${t('day')}`}
                              </span>
                            );
                          })()}
                      </div>
                    </TableCell>

                    {/* Status badge */}
                    <TableCell>
                      <StatusDotBadge
                        label={contract.status}
                        color={
                          CONTRACT_STATUS_COLORS[contract.status] ?? '#6b7280'
                        }
                      />
                    </TableCell>

                    {/* Health */}
                    <TableCell>
                      {contract.health ? (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={HEALTH_PROGRESS[contract.health] ?? 50}
                            className="h-2 w-16"
                          />
                          <ContractHealthBadge health={contract.health} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Cancellation deadline */}
                    <TableCell>
                      {contract.cancellation_deadline ? (
                        <div className="flex flex-col">
                          <span
                            className="text-xs"
                            style={{
                              color: deadlineSoon
                                ? theme.warningText
                                : theme.pageText,
                              fontWeight: deadlineSoon ? 600 : 400,
                            }}
                          >
                            {formatDateDE(contract.cancellation_deadline)}
                          </span>
                          {deadlineSoon && (
                            <Badge
                              variant="destructive"
                              className="mt-0.5 text-[10px] px-1.5 py-0 w-fit"
                            >
                              <Trans>Soon!</Trans>
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Footer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 16,
          marginBottom: 20,
          flexShrink: 0,
        }}
      >
        {!loading && (
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {filteredContracts.length === contracts.length
              ? t('{{n}} contract(s)', { n: contracts.length })
              : t('{{filtered}} of {{total}} contract(s)', {
                  filtered: filteredContracts.length,
                  total: contracts.length,
                })}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        <Button variant="primary" onPress={() => navigate('/contracts/new')}>
          <Trans>Add contract</Trans>
        </Button>
      </View>
    </Page>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export { displayAmount, SUGGESTED_TAGS };

function CostToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="bare"
      onPress={onPress}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        borderRight: `1px solid ${theme.tableBorder}`,
        backgroundColor: active
          ? theme.buttonPrimaryBackground
          : theme.tableBackground,
        color: active ? theme.buttonPrimaryText : theme.pageText,
        borderRadius: 0,
      }}
    >
      {label}
    </Button>
  );
}
