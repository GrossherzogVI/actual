// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';
import type { ContractEntity } from 'loot-core/server/contracts/app';

import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { useDashboardWidgetCopyMenu } from '@desktop-client/components/reports/useDashboardWidgetCopyMenu';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

type ContractsCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: { name?: string };
  onMetaChange: (newMeta: { name?: string }) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
};

function normalizeToMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return amount * (52 / 12);
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    case 'monthly':
    default:
      return amount;
  }
}

export function ContractsCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
  onRemove,
  onCopy,
}: ContractsCardProps) {
  const { t } = useTranslation();
  const [budgetId] = useMetadataPref('id');
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [contracts, setContracts] = useState<ContractEntity[] | null>(null);

  const { menuItems: copyMenuItems, handleMenuSelect: handleCopyMenuSelect } =
    useDashboardWidgetCopyMenu(onCopy);

  useEffect(() => {
    async function load() {
      if (!budgetId) return;
      const result = await (send as Function)('contract-list', {
        fileId: budgetId,
        status: 'active',
      });
      if (result && !('error' in result)) {
        setContracts(result);
      }
    }
    void load();
  }, [budgetId]);

  const activeCount = contracts?.length ?? 0;

  const totalMonthlyCost = contracts
    ? contracts.reduce((sum, c) => {
        if (c.amount == null) return sum;
        return sum + normalizeToMonthly(c.amount, c.frequency);
      }, 0)
    : 0;

  const upcomingDeadlines = contracts
    ? contracts
        .filter(c => c.cancellation_deadline)
        .sort(
          (a, b) =>
            new Date(a.cancellation_deadline!).getTime() -
            new Date(b.cancellation_deadline!).getTime(),
        )
        .slice(0, 3)
    : [];

  const handleMenuSelect = useCallback(
    (item: string) => {
      if (handleCopyMenuSelect(item)) return;
      switch (item) {
        case 'rename':
          setNameMenuOpen(true);
          break;
        case 'remove':
          onRemove();
          break;
        default:
          throw new Error(`Unrecognized selection: ${item}`);
      }
    },
    [handleCopyMenuSelect, onRemove],
  );

  return (
    <ReportCard
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to="/contracts"
      menuItems={[
        { name: 'rename', text: t('Rename') },
        { name: 'remove', text: t('Remove') },
        ...copyMenuItems,
      ]}
      onMenuSelect={handleMenuSelect}
    >
      <View style={{ flex: 1, padding: 20 }}>
        <ReportCardName
          name={meta?.name || t('Contracts')}
          isEditing={nameMenuOpen}
          onChange={newName => {
            onMetaChange({ ...meta, name: newName });
            setNameMenuOpen(false);
          }}
          onClose={() => setNameMenuOpen(false)}
        />

        {contracts === null ? (
          <LoadingIndicator />
        ) : (
          <View style={{ marginTop: 15, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                  {t('Active contracts')}
                </Text>
                <Text style={{ ...styles.mediumText, fontWeight: 600 }}>
                  {activeCount}
                </Text>
              </View>
              <View style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                  {t('Monthly cost')}
                </Text>
                <Text style={{ ...styles.mediumText, fontWeight: 600 }}>
                  {(totalMonthlyCost / 100).toFixed(2)}
                </Text>
              </View>
            </View>

            {upcomingDeadlines.length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.pageTextSubdued,
                    marginBottom: 6,
                  }}
                >
                  {t('Upcoming deadlines')}
                </Text>
                {upcomingDeadlines.map(c => (
                  <View
                    key={c.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      padding: '3px 0',
                      fontSize: 12,
                    }}
                  >
                    <Text
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        marginRight: 8,
                      }}
                    >
                      {c.name}
                    </Text>
                    <Text
                      style={{
                        color: isWithin30Days(c.cancellation_deadline!)
                          ? theme.warningText
                          : theme.pageTextSubdued,
                        fontWeight: isWithin30Days(c.cancellation_deadline!)
                          ? 600
                          : 400,
                        flexShrink: 0,
                      }}
                    >
                      {c.cancellation_deadline}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </ReportCard>
  );
}

function isWithin30Days(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}
