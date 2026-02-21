// @ts-strict-ignore
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

type Props = {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
};

export function WidgetCard({ title, children, style }: Props) {
  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        borderRadius: 8,
        border: `1px solid ${theme.tableBorder}`,
        padding: 16,
        ...style,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.tableHeaderText,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
