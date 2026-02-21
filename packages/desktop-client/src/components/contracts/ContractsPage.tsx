// @ts-strict-ignore
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';
import type { ContractEntity } from 'loot-core/server/contracts/app';

import { Page } from '@desktop-client/components/Page';
import { Search } from '@desktop-client/components/common/Search';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

const CONTRACT_TYPE_COLORS: Record<string, string> = {
  insurance: '#6366f1',
  rent: '#f59e0b',
  utility: '#10b981',
  subscription: '#3b82f6',
  tax: '#ef4444',
  loan: '#8b5cf6',
  other: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  cancelled: '#6b7280',
  pending_cancel: '#f59e0b',
  expired: '#ef4444',
  discovered: '#3b82f6',
};

function formatAmount(amount: number | null): string {
  if (amount == null) return '-';
  return (amount / 100).toFixed(2);
}

function isExpiringSoon(deadline: string | null): boolean {
  if (!deadline) return false;
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffDays = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

type StatusFilter = '' | 'active' | 'cancelled' | 'pending_cancel' | 'expired' | 'discovered';

export function ContractsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('contractManagement');
  const [budgetId] = useMetadataPref('id');
  const navigate = useNavigate();

  const [contracts, setContracts] = useState<ContractEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadContracts = useCallback(async () => {
    if (!budgetId) return;
    setLoading(true);
    const result = await (send as Function)('contract-list', {
      fileId: budgetId,
      status: statusFilter || undefined,
    });
    if (result && !('error' in result)) {
      setContracts(result);
    }
    setLoading(false);
  }, [budgetId, statusFilter]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const filteredContracts = useMemo(() => {
    if (!searchQuery) return contracts;
    const q = searchQuery.toLowerCase();
    return contracts.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.provider && c.provider.toLowerCase().includes(q)),
    );
  }, [contracts, searchQuery]);

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 0 15px',
          gap: 10,
        }}
      >
        <View>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            style={{
              padding: '5px 10px',
              borderRadius: 4,
              border: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.tableBackground,
              color: theme.pageText,
              fontSize: 13,
            }}
          >
            <option value="">{t('All statuses')}</option>
            <option value="active">{t('Active')}</option>
            <option value="cancelled">{t('Cancelled')}</option>
            <option value="pending_cancel">{t('Pending cancel')}</option>
            <option value="expired">{t('Expired')}</option>
            <option value="discovered">{t('Discovered')}</option>
          </select>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Search
            placeholder={t('Filter contracts...')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </View>
      </View>

      <View
        style={{
          backgroundColor: theme.tableBackground,
          borderRadius: 4,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        {/* Table header */}
        <View
          style={{
            flexDirection: 'row',
            padding: '8px 15px',
            borderBottom: `1px solid ${theme.tableBorder}`,
            backgroundColor: theme.tableHeaderBackground,
            fontSize: 12,
            fontWeight: 600,
            color: theme.pageTextSubdued,
          }}
        >
          <View style={{ flex: 2 }}>{t('Name')}</View>
          <View style={{ flex: 1 }}>{t('Type')}</View>
          <View style={{ flex: 1, textAlign: 'right' }}>{t('Amount')}</View>
          <View style={{ flex: 1 }}>{t('Frequency')}</View>
          <View style={{ flex: 1 }}>{t('Status')}</View>
          <View style={{ flex: 1 }}>{t('Cancel deadline')}</View>
          <View style={{ flex: 1 }}>{t('Next payment')}</View>
        </View>

        {/* Table body */}
        {loading ? (
          <View style={{ padding: 20, textAlign: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>{t('Loading...')}</Text>
          </View>
        ) : filteredContracts.length === 0 ? (
          <View style={{ padding: 20, textAlign: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              {searchQuery || statusFilter
                ? t('No contracts match the current filters.')
                : t('No contracts yet. Add one to get started.')}
            </Text>
          </View>
        ) : (
          filteredContracts.map(contract => (
            <View
              key={contract.id}
              onClick={() => navigate(`/contracts/${contract.id}`)}
              style={{
                flexDirection: 'row',
                padding: '10px 15px',
                borderBottom: `1px solid ${theme.tableBorder}`,
                cursor: 'pointer',
                fontSize: 13,
                ':hover': {
                  backgroundColor: theme.tableRowBackgroundHover,
                },
              }}
            >
              <View style={{ flex: 2 }}>
                <Text style={{ fontWeight: 500 }}>{contract.name}</Text>
                {contract.provider && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.pageTextSubdued,
                      marginTop: 2,
                    }}
                  >
                    {contract.provider}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                {contract.type && (
                  <Badge
                    label={contract.type}
                    color={CONTRACT_TYPE_COLORS[contract.type] || '#6b7280'}
                  />
                )}
              </View>
              <View style={{ flex: 1, textAlign: 'right' }}>
                <Text>{formatAmount(contract.amount)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text>{contract.frequency || '-'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Badge
                  label={contract.status.replace('_', ' ')}
                  color={STATUS_COLORS[contract.status] || '#6b7280'}
                />
              </View>
              <View style={{ flex: 1 }}>
                {contract.cancellation_deadline ? (
                  <Text
                    style={{
                      color: isExpiringSoon(contract.cancellation_deadline)
                        ? theme.warningText
                        : theme.pageText,
                      fontWeight: isExpiringSoon(contract.cancellation_deadline)
                        ? 600
                        : 400,
                    }}
                  >
                    {contract.cancellation_deadline}
                  </Text>
                ) : (
                  <Text style={{ color: theme.pageTextSubdued }}>-</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text>{contract.next_payment_date || '-'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          margin: '20px 0',
          flexShrink: 0,
        }}
      >
        <Button variant="primary" onPress={() => navigate('/contracts/new')}>
          <Trans>Add contract</Trans>
        </Button>
      </View>
    </Page>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 500,
        backgroundColor: `${color}20`,
        color,
        textTransform: 'capitalize',
      }}
    >
      {label}
    </Text>
  );
}
