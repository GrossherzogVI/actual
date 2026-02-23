// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { CsvImportWizard } from './CsvImportWizard';
import { FinanzguruWizard } from './FinanzguruWizard';

import { Page } from '@desktop-client/components/Page';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    <Card className="flex min-w-[220px] max-w-[300px] flex-1 items-center text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="items-center pb-2">
        <span className="text-4xl">{icon}</span>
        <CardTitle className="text-[15px]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-3">
        <CardDescription className="flex-1 leading-relaxed">
          {description}
        </CardDescription>
        <Button variant="primary" onPress={onStart}>
          <Trans>Start Import</Trans>
        </Button>
      </CardContent>
    </Card>
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
    <Card
      className={`flex min-w-[220px] max-w-[300px] flex-1 items-center text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${done ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
    >
      <CardHeader className="items-center pb-2">
        <span className="text-4xl">{done ? '\u2705' : '\uD83C\uDFF7\uFE0F'}</span>
        <CardTitle className="text-[15px]">
          <Trans>German Category Tree</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-3">
        <CardDescription className="flex-1 leading-relaxed">
          {done
            ? t('Category tree installed successfully.')
            : t(
                'Install a German household budget category tree. Includes 60+ categories for income, housing, groceries, mobility, and more.',
              )}
        </CardDescription>
        {error && (
          <Alert variant="destructive" className="py-2 text-left">
            <AlertTitle>{t('Error')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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
      </CardContent>
    </Card>
  );
}

// ---- Create account card ----

function CreateAccountCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card className="flex min-w-[220px] max-w-[300px] flex-1 items-center text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="items-center pb-2">
        <span className="text-4xl">{'\uD83D\uDCB0'}</span>
        <CardTitle className="text-[15px]">
          <Trans>Create Cash Account</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-3">
        <CardDescription className="flex-1 leading-relaxed">
          {t(
            "Add a local cash or manual account to track spending that isn't connected to a bank.",
          )}
        </CardDescription>
        <Button variant="normal" onPress={() => void navigate('/accounts')}>
          <Trans>Add Account</Trans>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---- Main page ----

export function ImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ type?: string }>();
  const subRoute = params.type as SubRoute;

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
        <div className="flex flex-wrap gap-4">
          <ImportCard
            icon={'\uD83C\uDFE6'}
            title={t('Finanzguru Export')}
            description={t(
              'Import transactions from the Finanzguru banking app. Supports XLSX export with automatic column detection.',
            )}
            onStart={() => void navigate('/import/finanzguru')}
          />
          <ImportCard
            icon={'\uD83D\uDCC4'}
            title={t('Bank CSV')}
            description={t(
              'Import CSV exports from German banks (Sparkasse, DKB, ING, Comdirect, and more). Auto-detects bank format.',
            )}
            onStart={() => void navigate('/import/csv')}
          />
          <CreateAccountCard />
          <CategorySetupCard />
        </div>

        {/* Tips section */}
        <Alert>
          <AlertTitle>{t('Tips')}</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
              <li>
                {t('Install the German category tree first for best auto-categorization results.')}
              </li>
              <li>
                {t('After importing, visit the Review Queue to accept AI category suggestions.')}
              </li>
              <li>
                {t('Duplicate transactions are automatically detected and skipped.')}
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      </View>
    </Page>
  );
}
