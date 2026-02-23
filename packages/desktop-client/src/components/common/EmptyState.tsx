import React from 'react';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
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
      className="animate-in fade-in-0 duration-300"
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
          letterSpacing: '-0.02em',
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
          lineHeight: '1.6',
        }}
      >
        {description}
      </Text>
      {actions && actions.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
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
