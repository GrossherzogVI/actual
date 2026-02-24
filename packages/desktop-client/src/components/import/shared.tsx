import React from 'react';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

type Step = 1 | 2 | 3 | 4 | 5;

export function StepIndicator({ step, total }: { step: Step; total: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        marginBottom: 20,
      }}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <View
          key={n}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              n < step
                ? '#10b981'
                : n === step
                  ? theme.buttonPrimaryBackground
                  : theme.tableBorder,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: n <= step ? '#fff' : theme.pageTextSubdued,
            }}
          >
            {n < step ? '✓' : String(n)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix, keep raw base64
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
