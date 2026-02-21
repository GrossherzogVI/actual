import React from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { Tooltip } from '@actual-app/components/tooltip';

import { CONTRACT_HEALTH_COLORS } from './types';

type HealthLevel = 'green' | 'yellow' | 'red';

type ContractHealthBadgeProps = {
  health: HealthLevel;
};

const HEALTH_LABELS: Record<HealthLevel, string> = {
  green: 'OK',
  yellow: 'Renewal soon',
  red: 'Deadline near',
};

const HEALTH_TOOLTIPS: Record<HealthLevel, string> = {
  green: 'Contract is in good standing',
  yellow: 'Auto-renewal is approaching',
  red: 'Cancellation deadline is near',
};

export function ContractHealthBadge({ health }: ContractHealthBadgeProps) {
  const { t } = useTranslation();
  const color = CONTRACT_HEALTH_COLORS[health];

  return (
    <Tooltip content={t(HEALTH_TOOLTIPS[health])} placement="top">
      <Text
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 500,
          color,
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 10 }}>&#9679;</span>
        {t(HEALTH_LABELS[health])}
      </Text>
    </Tooltip>
  );
}
