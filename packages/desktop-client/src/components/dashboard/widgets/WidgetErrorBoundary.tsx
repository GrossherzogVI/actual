import React, { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

type FallbackProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

function WidgetErrorFallback({ resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();

  return (
    <WidgetCard title={t('Error')}>
      <View style={{ alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
          <Trans>Widget konnte nicht geladen werden</Trans>
        </Text>
        <Button variant="bare" onPress={resetErrorBoundary}>
          {<Trans>Erneut versuchen</Trans>}
        </Button>
      </View>
    </WidgetCard>
  );
}

type Props = {
  children: React.ReactNode;
};

export function WidgetErrorBoundary({ children }: Props) {
  const handleError = useCallback((error: Error) => {
    console.error('[WidgetErrorBoundary]', error);
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={WidgetErrorFallback}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
}
