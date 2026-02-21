// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { useDashboardWidgetCopyMenu } from '@desktop-client/components/reports/useDashboardWidgetCopyMenu';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

type AIStatsCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: { name?: string };
  onMetaChange: (newMeta: { name?: string }) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
};

type QueueItem = {
  id: string;
  status: string;
  confidence: number;
};

export function AIStatsCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
  onRemove,
  onCopy,
}: AIStatsCardProps) {
  const { t } = useTranslation();
  const [budgetId] = useMetadataPref('id');
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[] | null>(null);

  const { menuItems: copyMenuItems, handleMenuSelect: handleCopyMenuSelect } =
    useDashboardWidgetCopyMenu(onCopy);

  useEffect(() => {
    async function load() {
      if (!budgetId) return;
      const result = await (send as Function)('ai-queue-list', {
        fileId: budgetId,
        limit: 500,
      });
      if (result && !('error' in result)) {
        setQueueItems(result);
      } else {
        setQueueItems([]);
      }
    }
    void load();
  }, [budgetId]);

  const pendingCount = queueItems
    ? queueItems.filter((i: QueueItem) => i.status === 'pending').length
    : 0;
  const highConfCount = queueItems
    ? queueItems.filter(
        (i: QueueItem) => i.status === 'pending' && i.confidence >= 0.8,
      ).length
    : 0;

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
      to="/ai-review"
      menuItems={[
        { name: 'rename', text: t('Rename') },
        { name: 'remove', text: t('Remove') },
        ...copyMenuItems,
      ]}
      onMenuSelect={handleMenuSelect}
    >
      <View style={{ flex: 1, padding: 20 }}>
        <ReportCardName
          name={meta?.name || t('AI Classification')}
          isEditing={nameMenuOpen}
          onChange={newName => {
            onMetaChange({ ...meta, name: newName });
            setNameMenuOpen(false);
          }}
          onClose={() => setNameMenuOpen(false)}
        />

        {queueItems === null ? (
          <LoadingIndicator />
        ) : (
          <View style={{ marginTop: 15, gap: 12 }}>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <View>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                  {t('Pending Review')}
                </Text>
                <Text style={{ ...styles.mediumText, fontWeight: 600 }}>
                  {pendingCount}
                </Text>
              </View>
              <View style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                  {t('High Confidence')}
                </Text>
                <Text style={{ ...styles.mediumText, fontWeight: 600 }}>
                  {highConfCount}
                </Text>
              </View>
            </View>

            {pendingCount > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.pageTextSubdued,
                    marginTop: 4,
                  }}
                >
                  {t(
                    '{{count}} items ready for review',
                    { count: pendingCount },
                  )}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ReportCard>
  );
}
