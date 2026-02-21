// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { CsvImportWizard } from './CsvImportWizard';
import { FinanzguruWizard } from './FinanzguruWizard';

type SubRoute = 'finanzguru' | 'csv' | undefined;

// ---- Import card on the hub page ----

type ImportCardProps = {
  icon: string;
  title: string;
  description: string;
  onStart: () => void;
};

function ImportCard({ icon, title, description, onStart }: ImportCardProps) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 220,
        maxWidth: 300,
        padding: 24,
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 10,
        gap: 12,
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <Text style={{ fontSize: 36 }}>{icon}</Text>
      <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued, lineHeight: '1.5', flex: 1 }}>
        {description}
      </Text>
      <Button variant="primary" onPress={onStart}>
        <Trans>Start Import</Trans>
      </Button>
    </View>
  );
}

// ---- Category setup card ----

function CategorySetupCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await (send as Function)('categories-setup-german-tree', {});
    if (res && 'error' in res) {
      setError(res.error as string);
    } else {
      setDone(true);
    }
    setLoading(false);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        minWidth: 220,
        maxWidth: 300,
        padding: 24,
        backgroundColor: done ? '#10b98108' : theme.tableBackground,
        border: `1px solid ${done ? '#10b981' : theme.tableBorder}`,
        borderRadius: 10,
        gap: 12,
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <Text style={{ fontSize: 36 }}>{done ? '✅' : '🏷️'}</Text>
      <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
        <Trans>German Category Tree</Trans>
      </Text>
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued, lineHeight: '1.5', flex: 1 }}>
        {done
          ? t('Category tree installed successfully.')
          : t(
              'Install a German household budget category tree. Includes 60+ categories for income, housing, groceries, mobility, and more.',
            )}
      </Text>
      {error && (
        <Text style={{ fontSize: 12, color: '#ef4444' }}>
          {t('Error: {{error}}', { error })}
        </Text>
      )}
      <Button
        variant={done ? 'bare' : 'normal'}
        onPress={handleSetup}
        isDisabled={loading || done}
      >
        {loading ? (
          <Trans>Installing…</Trans>
        ) : done ? (
          <Trans>Installed</Trans>
        ) : (
          <Trans>Install Categories</Trans>
        )}
      </Button>
    </View>
  );
}

// ---- Main page ----

export function ImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Sub-route from URL: /import/finanzguru or /import/csv
  const params = useParams<{ type?: string }>();
  const subRoute = params.type as SubRoute;

  const enabled = useFeatureFlag('germanCategories');

  if (!enabled) {
    return (
      <Page header={t('Import')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>
              Import is not enabled. Enable it in Settings &gt; Feature Flags.
            </Trans>
          </Text>
        </View>
      </Page>
    );
  }

  // Show sub-wizard when navigating to /import/finanzguru or /import/csv
  if (subRoute === 'finanzguru') {
    return (
      <Page header={t('Import — Finanzguru')}>
        <FinanzguruWizard />
      </Page>
    );
  }

  if (subRoute === 'csv') {
    return (
      <Page header={t('Import — Bank CSV')}>
        <CsvImportWizard />
      </Page>
    );
  }

  // Hub page
  return (
    <Page header={t('Import')}>
      <View style={{ gap: 24 }}>
        <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
          <Trans>
            Import your transaction history from external sources, or set up the German
            category structure for better budgeting.
          </Trans>
        </Text>

        {/* Import cards */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <ImportCard
            icon="🏦"
            title={t('Finanzguru Export')}
            description={t(
              'Import transactions from the Finanzguru banking app. Supports XLSX export with automatic column detection.',
            )}
            onStart={() => void navigate('/import/finanzguru')}
          />
          <ImportCard
            icon="📄"
            title={t('Bank CSV')}
            description={t(
              'Import CSV exports from German banks (Sparkasse, DKB, ING, Comdirect, and more). Auto-detects bank format.',
            )}
            onStart={() => void navigate('/import/csv')}
          />
          <CategorySetupCard />
        </View>

        {/* Tips section */}
        <View
          style={{
            padding: '16px 20px',
            backgroundColor: theme.tableBackground,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 8,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
            <Trans>Tips</Trans>
          </Text>
          <View style={{ gap: 6 }}>
            {[
              t('Install the German category tree first for best auto-categorization results.'),
              t('After importing, visit the Review Queue to accept AI category suggestions.'),
              t('Duplicate transactions are automatically detected and skipped.'),
            ].map((tip, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>•</Text>
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued, flex: 1 }}>
                  {tip}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Page>
  );
}
