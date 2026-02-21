// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

type Step = 1 | 2 | 3 | 4 | 5;
type Language = 'de' | 'en';
type ImportChoice = 'finanzguru' | 'csv' | 'skip';

export function GettingStartedWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [language, setLanguage] = useState<Language>('de');
  const [categorySetupDone, setCategorySetupDone] = useState(false);
  const [categorySetupLoading, setCategorySetupLoading] = useState(false);
  const [categorySetupError, setCategorySetupError] = useState<string | null>(null);
  const [importChoice, setImportChoice] = useState<ImportChoice | null>(null);

  const handleSetupGermanCategories = useCallback(async () => {
    setCategorySetupLoading(true);
    setCategorySetupError(null);
    const res = await (send as Function)('categories-setup-german-tree', {});
    if (res && 'error' in res) {
      setCategorySetupError(res.error as string);
    } else {
      setCategorySetupDone(true);
    }
    setCategorySetupLoading(false);
  }, []);

  const steps: Array<{ label: string }> = [
    { label: t('Welcome') },
    { label: t('Categories') },
    { label: t('Import') },
    { label: t('Review') },
    { label: t('Done') },
  ];

  return (
    <View
      style={{
        maxWidth: 600,
        width: '100%',
        margin: '0 auto',
        gap: 0,
      }}
    >
      {/* Progress bar */}
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 32 }}>
        {steps.map((s, i) => (
          <View key={i} style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor:
                  i + 1 < step
                    ? '#10b981'
                    : i + 1 === step
                      ? theme.buttonPrimaryBackground
                      : theme.tableBorder,
              }}
            />
            <Text
              style={{
                fontSize: 10,
                color:
                  i + 1 <= step ? theme.pageText : theme.pageTextSubdued,
                textAlign: 'center',
                fontWeight: i + 1 === step ? 600 : 400,
              }}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Step 1: Welcome + language ── */}
      {step === 1 && (
        <View style={{ gap: 24, alignItems: 'center', textAlign: 'center' }}>
          <Text style={{ fontSize: 32 }}>👋</Text>
          <Text style={{ fontSize: 22, fontWeight: 700, color: theme.pageText }}>
            <Trans>Welcome to Actual Budget++</Trans>
          </Text>
          <Text style={{ fontSize: 14, color: theme.pageTextSubdued, maxWidth: 420, lineHeight: '1.6' }}>
            <Trans>
              This setup wizard will help you get started quickly. We'll set up your
              categories, import your transactions, and configure AI classification.
            </Trans>
          </Text>

          <View style={{ gap: 8, width: '100%', maxWidth: 300 }}>
            <Text style={{ fontSize: 13, fontWeight: 500, color: theme.pageText }}>
              <Trans>Primary language</Trans>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['de', 'en'] as Language[]).map(lang => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 6,
                    border: `2px solid ${language === lang ? theme.buttonPrimaryBackground : theme.tableBorder}`,
                    backgroundColor:
                      language === lang
                        ? `${theme.buttonPrimaryBackground}15`
                        : theme.tableBackground,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                    color: language === lang ? theme.buttonPrimaryBackground : theme.pageText,
                  }}
                >
                  {lang === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English'}
                </button>
              ))}
            </View>
          </View>

          <Button variant="primary" onPress={() => setStep(2)}>
            <Trans>Get Started</Trans>
          </Button>
        </View>
      )}

      {/* ── Step 2: Categories ── */}
      {step === 2 && (
        <View style={{ gap: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 600, color: theme.pageText }}>
            <Trans>Set Up Categories</Trans>
          </Text>
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued, lineHeight: '1.6' }}>
            <Trans>
              Actual Budget++ includes a German category tree optimized for household budgeting.
              You can install it now or skip and set up categories manually later.
            </Trans>
          </Text>

          {categorySetupDone ? (
            <View
              style={{
                padding: '14px 18px',
                backgroundColor: '#10b98110',
                borderRadius: 6,
                border: '1px solid #10b981',
              }}
            >
              <Text style={{ fontSize: 13, color: '#10b981' }}>
                <Trans>German category tree installed successfully.</Trans>
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Button
                variant="primary"
                onPress={handleSetupGermanCategories}
                isDisabled={categorySetupLoading}
              >
                {categorySetupLoading ? (
                  <Trans>Installing…</Trans>
                ) : language === 'de' ? (
                  <Trans>Install German Category Tree</Trans>
                ) : (
                  <Trans>Install German Category Tree (recommended)</Trans>
                )}
              </Button>
              {categorySetupError && (
                <Text style={{ fontSize: 12, color: '#ef4444' }}>
                  {t('Error: {{error}}', { error: categorySetupError })}
                </Text>
              )}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="bare" onPress={() => setStep(1)}>
              <Trans>Back</Trans>
            </Button>
            <Button variant="normal" onPress={() => setStep(3)}>
              {categorySetupDone ? <Trans>Next</Trans> : <Trans>Skip for now</Trans>}
            </Button>
          </View>
        </View>
      )}

      {/* ── Step 3: Import choice ── */}
      {step === 3 && (
        <View style={{ gap: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 600, color: theme.pageText }}>
            <Trans>Import Your Transactions</Trans>
          </Text>
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            <Trans>How do you want to import your transaction history?</Trans>
          </Text>

          <View style={{ gap: 10 }}>
            {[
              {
                id: 'finanzguru' as ImportChoice,
                icon: '🏦',
                title: t('Finanzguru Export'),
                desc: t('Import XLSX export from the Finanzguru app'),
              },
              {
                id: 'csv' as ImportChoice,
                icon: '📄',
                title: t('Bank CSV'),
                desc: t('Import CSV export from your bank'),
              },
              {
                id: 'skip' as ImportChoice,
                icon: '⏭',
                title: t('Skip for now'),
                desc: t("I'll add transactions manually or use bank sync"),
              },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setImportChoice(option.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 8,
                  border: `2px solid ${importChoice === option.id ? theme.buttonPrimaryBackground : theme.tableBorder}`,
                  backgroundColor:
                    importChoice === option.id
                      ? `${theme.buttonPrimaryBackground}10`
                      : theme.tableBackground,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <Text style={{ fontSize: 24 }}>{option.icon}</Text>
                <View style={{ gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color:
                        importChoice === option.id
                          ? theme.buttonPrimaryBackground
                          : theme.pageText,
                    }}
                  >
                    {option.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    {option.desc}
                  </Text>
                </View>
              </button>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="bare" onPress={() => setStep(2)}>
              <Trans>Back</Trans>
            </Button>
            <Button
              variant="primary"
              onPress={() => {
                if (importChoice === 'finanzguru') {
                  void navigate('/import/finanzguru');
                } else if (importChoice === 'csv') {
                  void navigate('/import/csv');
                } else {
                  setStep(4);
                }
              }}
              isDisabled={!importChoice}
            >
              {importChoice === 'skip' ? <Trans>Next</Trans> : <Trans>Start Import</Trans>}
            </Button>
          </View>
        </View>
      )}

      {/* ── Step 4: Review AI suggestions ── */}
      {step === 4 && (
        <View style={{ gap: 20, alignItems: 'center', textAlign: 'center' }}>
          <Text style={{ fontSize: 32 }}>🤖</Text>
          <Text style={{ fontSize: 18, fontWeight: 600, color: theme.pageText }}>
            <Trans>Review AI Suggestions</Trans>
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: theme.pageTextSubdued,
              maxWidth: 420,
              lineHeight: '1.6',
            }}
          >
            <Trans>
              After importing transactions, AI will analyze them and suggest categories.
              Visit the Review Queue to accept or reject suggestions.
            </Trans>
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="bare" onPress={() => setStep(3)}>
              <Trans>Back</Trans>
            </Button>
            <Button variant="primary" onPress={() => setStep(5)}>
              <Trans>Next</Trans>
            </Button>
          </View>
        </View>
      )}

      {/* ── Step 5: Done ── */}
      {step === 5 && (
        <View style={{ gap: 24, alignItems: 'center', textAlign: 'center' }}>
          <Text style={{ fontSize: 48 }}>🎉</Text>
          <Text style={{ fontSize: 22, fontWeight: 700, color: theme.pageText }}>
            <Trans>You're all set!</Trans>
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.pageTextSubdued,
              maxWidth: 420,
              lineHeight: '1.6',
            }}
          >
            <Trans>
              Your Actual Budget++ is ready. Head to the Dashboard to see your overview,
              or go to Budgets to start planning.
            </Trans>
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button variant="primary" onPress={() => void navigate('/dashboard')}>
              <Trans>Go to Dashboard</Trans>
            </Button>
            <Button variant="normal" onPress={() => void navigate('/budget')}>
              <Trans>Open Budget</Trans>
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
