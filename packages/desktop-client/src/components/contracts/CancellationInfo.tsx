import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { daysUntil, isDeadlineSoon } from './types';
import type { ContractEntity } from './types';

type CancellationInfoProps = {
  contract: ContractEntity;
};

function InfoRow({ label, value, valueStyle }: {
  label: string;
  value: React.ReactNode;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 6,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: theme.pageTextSubdued,
          minWidth: 160,
          flexShrink: 0,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 13, ...valueStyle }}>{value}</Text>
    </View>
  );
}

export function CancellationInfo({ contract }: CancellationInfoProps) {
  const { t } = useTranslation();
  const deadline = contract.cancellation_deadline;
  const deadlineSoon = isDeadlineSoon(deadline);
  const daysLeft = daysUntil(deadline);

  const deadlineDisplay = deadline ? (
    <Text
      style={{
        color: deadlineSoon ? theme.warningText : theme.pageText,
        fontWeight: deadlineSoon ? 600 : 400,
      }}
    >
      {deadline}
      {daysLeft !== null && daysLeft >= 0 && (
        <Text
          style={{
            fontSize: 11,
            color: deadlineSoon ? theme.warningText : theme.pageTextSubdued,
            marginLeft: 6,
          }}
        >
          ({t('{{n}} days left', { n: daysLeft })})
        </Text>
      )}
      {daysLeft !== null && daysLeft < 0 && (
        <Text
          style={{
            fontSize: 11,
            color: theme.pageTextSubdued,
            marginLeft: 6,
          }}
        >
          (<Trans>passed</Trans>)
        </Text>
      )}
    </Text>
  ) : (
    <Text style={{ color: theme.pageTextSubdued }}>{t('None')}</Text>
  );

  return (
    <View
      style={{
        backgroundColor: deadlineSoon
          ? `${theme.warningText}10`
          : theme.tableBackground,
        borderRadius: 6,
        padding: 12,
        border: deadlineSoon
          ? `1px solid ${theme.warningText}40`
          : `1px solid ${theme.tableBorder}`,
      }}
    >
      {deadlineSoon && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            padding: '4px 8px',
            backgroundColor: `${theme.warningText}20`,
            borderRadius: 4,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.warningText, fontWeight: 600 }}>
            <Trans>Action required: cancellation deadline approaching</Trans>
          </Text>
        </View>
      )}

      <InfoRow label={t('End date')} value={contract.end_date || t('Open-ended')} />
      <InfoRow
        label={t('Notice period')}
        value={
          contract.notice_period_months
            ? t('{{n}} month(s)', { n: contract.notice_period_months })
            : t('None')
        }
      />
      <InfoRow
        label={t('Cancellation deadline')}
        value={deadlineDisplay}
        valueStyle={deadlineSoon ? { color: theme.warningText } : undefined}
      />
      <InfoRow
        label={t('Auto-renewal')}
        value={
          contract.auto_renewal ? (
            <Text style={{ color: theme.noticeText }}>
              <Trans>Yes — renews automatically</Trans>
            </Text>
          ) : (
            t('No')
          )
        }
      />
    </View>
  );
}
