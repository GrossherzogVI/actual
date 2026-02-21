import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { ContractHealthBadge } from './ContractHealthBadge';
import {
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_COLORS,
  formatAmountEur,
  isDeadlineSoon,
} from './types';
import type { ContractEntity } from './types';

type ContractListItemProps = {
  contract: ContractEntity;
};

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

export function ContractListItem({ contract }: ContractListItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate(`/contracts/${contract.id}`);
  }, [navigate, contract.id]);

  const deadlineSoon = isDeadlineSoon(contract.cancellation_deadline);

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
      }}
      data-contract-row
    >
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
          {contract.amount != null ? `€${formatAmountEur(contract.amount)}` : '-'}
        </Text>
        {contract.interval && (
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            /{contract.interval}
          </Text>
        )}
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
            {contract.cancellation_deadline}
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
