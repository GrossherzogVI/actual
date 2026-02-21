import React from 'react';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

type EmptyStateAction = {
  label: string;
  onPress: () => void;
  primary?: boolean;
};

type EmptyStateProps = {
  title: string;
  description: string;
  actions?: EmptyStateAction[];
};

export function EmptyState({ title, description, actions }: EmptyStateProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        minHeight: 200,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: theme.pageText,
          marginBottom: 10,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: theme.pageTextSubdued,
          marginBottom: actions && actions.length > 0 ? 24 : 0,
          textAlign: 'center',
          maxWidth: 400,
          lineHeight: '1.5',
        }}
      >
        {description}
      </Text>
      {actions && actions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions.map((action, idx) => (
            <Button
              key={idx}
              variant={action.primary ? 'primary' : 'normal'}
              onPress={action.onPress}
            >
              {action.label}
            </Button>
          ))}
        </View>
      )}
    </View>
  );
}
