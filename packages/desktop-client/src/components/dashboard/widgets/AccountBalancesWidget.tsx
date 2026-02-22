// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useFormat } from '@desktop-client/hooks/useFormat';
import { useOffBudgetAccounts } from '@desktop-client/hooks/useOffBudgetAccounts';
import { useOnBudgetAccounts } from '@desktop-client/hooks/useOnBudgetAccounts';
import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { accountBalance } from '@desktop-client/spreadsheet/bindings';

import { WidgetCard } from './WidgetCard';

function AccountRow({ account }: { account: { id: string; name: string } }) {
  const format = useFormat();
  const balance = useSheetValue<'account', 'balance'>(accountBalance(account.id));

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 6,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: theme.pageText,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          marginRight: 8,
        }}
      >
        {account.name}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          color: balance != null && balance < 0 ? (theme.errorText ?? '#ef4444') : theme.pageText,
        }}
      >
        {balance != null ? format(balance, 'financial') : '--'}
      </Text>
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: theme.pageTextSubdued,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        marginBottom: 6,
        marginTop: 4,
      }}
    >
      {label}
    </Text>
  );
}

export function AccountBalancesWidget() {
  const { t } = useTranslation();
  const onBudget = useOnBudgetAccounts();
  const offBudget = useOffBudgetAccounts();

  const hasAccounts = onBudget.length > 0 || offBudget.length > 0;

  return (
    <WidgetCard title={t('Account Balances')}>
      {!hasAccounts ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('No accounts yet. Import bank data to see balances.')}
        </Text>
      ) : (
        <>
          {onBudget.length > 0 && (
            <>
              <SectionLabel label={t('On Budget')} />
              {onBudget.map(account => (
                <AccountRow key={account.id} account={account} />
              ))}
            </>
          )}
          {offBudget.length > 0 && (
            <>
              <SectionLabel label={t('Off Budget')} />
              {offBudget.map(account => (
                <AccountRow key={account.id} account={account} />
              ))}
            </>
          )}
        </>
      )}
    </WidgetCard>
  );
}
