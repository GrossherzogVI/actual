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
  isIncome?: boolean;
  'data-quick-add-amount'?: boolean;
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

export function AmountInput({
  value,
  onChange,
  evaluatedAmount,
  autoFocus,
  isIncome = false,
  ...rest
}: AmountInputProps) {
  const showResult = isExpression(value) && evaluatedAmount !== null;

  // Color: income = green, expense = default text
  const amountColor = isIncome ? '#10b981' : theme.formInputText;

  return (
    <View style={{ alignItems: 'center', padding: '12px 16px 8px' }}>
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0.00"
        data-quick-add-amount={rest['data-quick-add-amount'] ? 'true' : undefined}
        style={{
          fontSize: 28,
          fontWeight: 600,
          textAlign: 'center',
          border: 'none',
          borderBottom: `2px solid ${isIncome ? '#10b981' : theme.formInputBorder}`,
          borderRadius: 0,
          backgroundColor: 'transparent',
          color: amountColor,
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
