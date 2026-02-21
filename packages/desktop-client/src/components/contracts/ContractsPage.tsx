// @ts-strict-ignore
import React, { useCallback, useMemo, useState } from 'react';
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
import { CONTRACT_TYPE_OPTIONS } from './types';

// '' means "all"
type StatusFilter = '' | 'active' | 'expiring' | 'cancelled' | 'paused' | 'discovered';
type TypeFilter = '' | string;

const STATUS_FILTER_OPTIONS: [string, string][] = [
  ['', 'All statuses'],
  ['active', 'Active'],
  ['expiring', 'Expiring'],
  ['cancelled', 'Cancelled'],
  ['paused', 'Paused'],
  ['discovered', 'Discovered'],
];

const TYPE_FILTER_OPTIONS: [string, string][] = [
  ['', 'All types'],
  ...CONTRACT_TYPE_OPTIONS,
];

function TableHeader() {
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
      <View style={{ flex: 2 }}>{t('Name')}</View>
      <View style={{ flex: 1 }}>{t('Type')}</View>
      <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 4 }}>{t('Amount')}</View>
      <View style={{ flex: 1 }}>{t('Status')}</View>
      <View style={{ flex: 1 }}>{t('Health')}</View>
      <View style={{ flex: 1 }}>{t('Cancel deadline')}</View>
    </View>
  );
}

export function ContractsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('contractManagement');
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { contracts, loading, error } = useContracts({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  });

  const filteredContracts = useMemo(() => {
    if (!searchQuery) return contracts;
    const q = searchQuery.toLowerCase();
    return contracts.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.provider && c.provider.toLowerCase().includes(q)) ||
        (c.counterparty && c.counterparty.toLowerCase().includes(q)),
    );
  }, [contracts, searchQuery]);

  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v as StatusFilter);
  }, []);

  const handleTypeChange = useCallback((v: string) => {
    setTypeFilter(v);
  }, []);

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
      {/* Summary card */}
      <ContractSummaryCard />

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
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          defaultLabel={t('All statuses')}
          onChange={handleStatusChange}
          style={{ minWidth: 130 }}
        />
        <Select
          options={TYPE_FILTER_OPTIONS}
          value={typeFilter}
          defaultLabel={t('All types')}
          onChange={handleTypeChange}
          style={{ minWidth: 130 }}
        />
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Search
            placeholder={t('Filter contracts…')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </View>
      </View>

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
        <TableHeader />

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
          searchQuery || statusFilter || typeFilter ? (
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
            <ContractListItem key={contract.id} contract={contract} />
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
