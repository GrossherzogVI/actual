// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import {
  TYPE_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  type TypeFilter,
  type PriorityFilter,
} from './types';

type ReviewFiltersProps = {
  typeFilter: TypeFilter;
  priorityFilter: PriorityFilter;
  onTypeChange: (value: TypeFilter) => void;
  onPriorityChange: (value: PriorityFilter) => void;
};

export function ReviewFilters({
  typeFilter,
  priorityFilter,
  onTypeChange,
  onPriorityChange,
}: ReviewFiltersProps) {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0 12px',
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          opacity: 0.6,
          whiteSpace: 'nowrap',
        }}
      >
        {t('Filter:')}
      </Text>
      <Select<TypeFilter>
        options={TYPE_FILTER_OPTIONS}
        value={typeFilter}
        onChange={onTypeChange}
        style={{ minWidth: 150 }}
      />
      <Select<PriorityFilter>
        options={PRIORITY_FILTER_OPTIONS}
        value={priorityFilter}
        onChange={onPriorityChange}
        style={{ minWidth: 150 }}
      />
    </View>
  );
}
