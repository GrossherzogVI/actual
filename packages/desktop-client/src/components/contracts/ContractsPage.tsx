// @ts-strict-ignore
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { Page } from '@desktop-client/components/Page';
import { EmptyState } from '@desktop-client/components/common/EmptyState';
import { Search } from '@desktop-client/components/common/Search';
import { SkeletonList } from '@desktop-client/components/common/Skeleton';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { ContractListItem } from './ContractListItem';
import { ContractSummaryCard } from './ContractSummaryCard';
import { useContracts } from './hooks/useContracts';
import { CONTRACT_TYPE_OPTIONS, formatAmountEur } from './types';
import type { ContractEntity } from './types';

// '' means "all"
type StatusFilter = '' | 'active' | 'expiring' | 'cancelled' | 'paused' | 'discovered';
type TypeFilter = '' | string;
export type CostView = 'monthly' | 'annual';

// Status and type filter options are built inside the component so labels pass through t().

// Pre-suggested tags (German context)
const SUGGESTED_TAGS = ['Urlaub', 'Steuerlich relevant', 'Geteilt', 'Einmalig'];

function TableHeader({ costView }: { costView: CostView }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: '7px 15px',
        borderBottom: `1px solid ${theme.tableBorder}`,
        backgroundColor: theme.tableHeaderBackground,
        fontSize: 11,
        fontWeight: 600,
        color: theme.tableHeaderText,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {/* checkbox placeholder */}
      <View style={{ width: 24, flexShrink: 0 }} />
      <View style={{ flex: 2 }}>{t('Name')}</View>
      <View style={{ flex: 1 }}>{t('Type')}</View>
      <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 4 }}>
        {costView === 'monthly' ? t('Monthly') : t('Annual')}
      </View>
      <View style={{ flex: 1 }}>{t('Status')}</View>
      <View style={{ flex: 1 }}>{t('Health')}</View>
      <View style={{ flex: 1 }}>{t('Cancel deadline')}</View>
    </View>
  );
}

/** Compute the display amount for a contract given the chosen cost view. */
function displayAmount(contract: ContractEntity, costView: CostView): number | null {
  if (contract.amount == null) return null;
  if (costView === 'annual') {
    // Use pre-computed annual_cost if available, otherwise convert
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: '8px 15px',
        backgroundColor: `${theme.buttonPrimaryBackground}15`,
        borderRadius: 5,
        border: `1px solid ${theme.buttonPrimaryBackground}40`,
        marginBottom: 8,
        flexWrap: 'wrap',
      }}
    >
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
      <Button variant="bare" onPress={onClearSelection} style={{ fontSize: 12 }}>
        <Trans>Clear</Trans>
      </Button>
    </View>
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
      ...CONTRACT_TYPE_OPTIONS.map(([value, label]) => [value, t(label)] as [string, string]),
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

  const { contracts, loading, error, updateContract, deleteContract } = useContracts({
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
      list = list.filter(c => Array.isArray(c.tags) && c.tags.includes(tagFilter));
    }
    return list;
  }, [contracts, searchQuery, tagFilter]);

  // Collect all tags across loaded contracts for the filter dropdown
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
    () => [['', t('All tags')], ...allTags.map(tag => [tag, tag] as [string, string])],
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
          // Range select: find indices in filteredContracts
          const ids = filteredContracts.map(c => c.id);
          const fromIdx = ids.indexOf(lastClickedId.current);
          const toIdx = ids.indexOf(id);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
            for (let i = start; i <= end; i++) {
              next.add(ids[i]);
            }
            return next;
          }
        }
        // Toggle single item
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
    if (!window.confirm(t('Delete {{n}} contract(s)?', { n: selected.size }))) return;
    for (const id of selected) {
      await deleteContract(id);
    }
    clearSelection();
  }, [selected, deleteContract, clearSelection, t]);

  const handleBatchStatus = useCallback(
    async (status: string) => {
      for (const id of selected) {
        await updateContract(id, { status: status as ContractEntity['status'] });
      }
      clearSelection();
    },
    [selected, updateContract, clearSelection],
  );

  // ── Feature flag guard ──────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <Page header={t('Contracts')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Contract management is not enabled. Enable it in Settings > Feature Flags.')}
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Contracts')}>
      {/* Summary card — pass costView so it can toggle too */}
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

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Search
            placeholder={t('Filter contracts…')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </View>
      </View>

      {/* Selection bar (only when items are selected) */}
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
      <View
        style={{
          backgroundColor: theme.tableBackground,
          borderRadius: 6,
          border: `1px solid ${theme.tableBorder}`,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        <TableHeader costView={costView} />

        {/* Body */}
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
              <Text style={{ color: theme.pageTextSubdued, fontSize: 14, textAlign: 'center' }}>
                {t('No contracts match the current filters.')}
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
          filteredContracts.map(contract => (
            <ContractListItem
              key={contract.id}
              contract={contract}
              costView={costView}
              isSelected={selected.has(contract.id)}
              onSelect={handleSelectContract}
            />
          ))
        )}
      </View>

      {/* Footer — count + add button */}
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
        backgroundColor: active ? theme.buttonPrimaryBackground : theme.tableBackground,
        color: active ? theme.buttonPrimaryText : theme.pageText,
        borderRadius: 0,
      }}
    >
      {label}
    </Button>
  );
}
