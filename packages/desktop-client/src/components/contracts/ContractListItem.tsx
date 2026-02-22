// @ts-strict-ignore
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { ContractHealthBadge } from './ContractHealthBadge';
import {
  CONTRACT_INTERVAL_OPTIONS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_COLORS,
  formatAmountEur,
  isDeadlineSoon,
} from './types';
import type { ContractEntity } from './types';
import { displayAmount } from './ContractsPage';
import type { CostView } from './ContractsPage';

const INTERVAL_LABELS: Record<string, string> = Object.fromEntries(CONTRACT_INTERVAL_OPTIONS);

const DE_DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Format an ISO date string (YYYY-MM-DD) using de-DE locale (DD.MM.YYYY). */
function formatDateDE(dateStr: string): string {
  // Parse as local date to avoid UTC offset shifting the day
  const [year, month, day] = dateStr.split('-').map(Number);
  return DE_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

type ContractListItemProps = {
  contract: ContractEntity;
  costView?: CostView;
  isSelected?: boolean;
  onSelect?: (id: string, shiftKey: boolean) => void;
};

// Days per billing cycle used for cost-per-day fallback when the server value is absent.
// Keys match ContractEntity.interval values.
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
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Text>
  );
}

export function ContractListItem({
  contract,
  costView = 'monthly',
  isSelected = false,
  onSelect,
}: ContractListItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // If the click is on the checkbox area, handle selection only
      if ((e.target as HTMLElement).closest('[data-checkbox]')) return;

      if (onSelect && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSelect(contract.id, e.shiftKey);
        return;
      }
      navigate(`/contracts/${contract.id}`);
    },
    [navigate, contract.id, onSelect],
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(contract.id, e.shiftKey);
    },
    [contract.id, onSelect],
  );

  const deadlineSoon = isDeadlineSoon(contract.cancellation_deadline);
  const amt = displayAmount(contract, costView);
  const intervalLabel = costView === 'annual'
    ? t('year')
    : (INTERVAL_LABELS[contract.interval] ?? contract.interval);

  return (
    <View
      role="row"
      onClick={handleClick}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: '10px 15px',
        borderBottom: `1px solid ${theme.tableBorder}`,
        cursor: 'pointer',
        fontSize: 13,
        gap: 4,
        backgroundColor: isSelected ? `${theme.buttonPrimaryBackground}12` : undefined,
      }}
      data-contract-row
    >
      {/* Checkbox (flex-shrink: 0 so it doesn't squeeze) */}
      <View
        data-checkbox
        onClick={handleCheckboxClick}
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {/* controlled via click handler */}}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer', accentColor: theme.buttonPrimaryBackground }}
        />
      </View>

      {/* Name + provider (flex: 2) */}
      <View style={{ flex: 2, minWidth: 0 }}>
        <Text
          style={{
            fontWeight: 500,
            color: theme.pageText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contract.name}
        </Text>
        {contract.provider && (
          <Text
            style={{
              fontSize: 11,
              color: theme.pageTextSubdued,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {contract.provider}
          </Text>
        )}
        {/* Tags */}
        {Array.isArray(contract.tags) && contract.tags.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
            {contract.tags.map(tag => (
              <Text
                key={tag}
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 8,
                  backgroundColor: `${theme.pageTextSubdued}18`,
                  color: theme.pageTextSubdued,
                }}
              >
                {tag}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Type badge (flex: 1) */}
      <View style={{ flex: 1 }}>
        {contract.type && (
          <Badge
            label={contract.type}
            color={CONTRACT_TYPE_COLORS[contract.type] ?? '#6b7280'}
          />
        )}
      </View>

      {/* Amount (flex: 1, right-aligned) */}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={{ fontWeight: 500 }}>
          {amt != null ? `€${formatAmountEur(amt)}` : '-'}
        </Text>
        {intervalLabel && (
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            /{intervalLabel}
          </Text>
        )}
        {costView === 'monthly' &&
          (() => {
            const costPerDay = computeCostPerDay(contract);
            if (costPerDay == null) return null;
            return (
              <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                {`€${formatAmountEur(costPerDay)}/${t('day')}`}
              </Text>
            );
          })()}
      </View>

      {/* Status badge (flex: 1) */}
      <View style={{ flex: 1 }}>
        <Badge
          label={contract.status}
          color={CONTRACT_STATUS_COLORS[contract.status] ?? '#6b7280'}
        />
      </View>

      {/* Health badge (flex: 1) */}
      <View style={{ flex: 1 }}>
        {contract.health && <ContractHealthBadge health={contract.health} />}
      </View>

      {/* Cancellation deadline (flex: 1) */}
      <View style={{ flex: 1 }}>
        {contract.cancellation_deadline ? (
          <Text
            style={{
              color: deadlineSoon ? theme.warningText : theme.pageText,
              fontWeight: deadlineSoon ? 600 : 400,
              fontSize: 12,
            }}
          >
            {formatDateDE(contract.cancellation_deadline)}
            {deadlineSoon && (
              <Text
                style={{
                  display: 'block',
                  fontSize: 10,
                  color: theme.warningText,
                }}
              >
                {t('Soon!')}
              </Text>
            )}
          </Text>
        ) : (
          <Text style={{ color: theme.pageTextSubdued }}>-</Text>
        )}
      </View>
    </View>
  );
}
