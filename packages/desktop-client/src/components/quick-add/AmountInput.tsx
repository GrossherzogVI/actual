// @ts-strict-ignore
import React from 'react';

import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

type AmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  evaluatedAmount: number | null;
  autoFocus?: boolean;
};

function formatEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function isExpression(value: string): boolean {
  return /[+\-*/()]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value.trim());
}

export function AmountInput({ value, onChange, evaluatedAmount, autoFocus }: AmountInputProps) {
  const showResult = isExpression(value) && evaluatedAmount !== null;

  return (
    <View style={{ alignItems: 'center', padding: '12px 16px 8px' }}>
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0.00"
        style={{
          fontSize: 28,
          fontWeight: 600,
          textAlign: 'center',
          border: 'none',
          borderBottom: `2px solid ${theme.formInputBorder}`,
          borderRadius: 0,
          backgroundColor: 'transparent',
          color: theme.formInputText,
          width: '100%',
          padding: '4px 8px',
          outline: 'none',
        }}
      />
      {showResult && evaluatedAmount !== null && (
        <Text
          style={{
            marginTop: 6,
            fontSize: 13,
            color: theme.pageTextSubdued,
          }}
        >
          = {formatEur(evaluatedAmount)}
        </Text>
      )}
    </View>
  );
}
