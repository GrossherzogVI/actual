// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from 'loot-core/platform/client/connection';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import type { ImportCommitResult } from './types';

const EUR_FORMATTER = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function formatEurCents(cents: number): string {
  return EUR_FORMATTER.format(Math.abs(cents) / 100);
}

type DetectedContract = {
  id?: string;
  name: string;
  amount: number | null;
  interval: string | null;
  provider?: string | null;
};

type DetectResult = {
  detected: number;
  contracts: DetectedContract[];
  review_items: number;
};

type Props = {
  result: ImportCommitResult;
  onReset: () => void;
};

export function ImportAdvisor({ result, onReset }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Post-import contract detection
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    // Auto-run detection after import completes
    let cancelled = false;
    setDetecting(true);
    void (send as Function)('import-detect-contracts', {}).then((res: unknown) => {
      if (cancelled) return;
      if (res && typeof res === 'object' && !('error' in (res as object))) {
        setDetected(res as DetectResult);
      }
      setDetecting(false);
    }).catch(() => setDetecting(false));
    return () => { cancelled = true; };
  }, []);

  const handleCreateContract = useCallback(
    async (contract: DetectedContract, idx: number) => {
      setCreatingId(String(idx));
      await navigate(
        `/contracts/new?prefill=${encodeURIComponent(
          JSON.stringify({
            name: contract.name,
            amount: contract.amount != null ? String(contract.amount / 100) : '',
            interval: contract.interval ?? 'monthly',
            provider: contract.provider ?? '',
          }),
        )}`,
      );
      setCreatingId(null);
    },
    [navigate],
  );

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 24,
        padding: '40px 20px',
      }}
    >
      {/* Success icon */}
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: '#10b98120',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
        }}
      >
        <span>✓</span>
      </View>

      {/* Title */}
      <Text
        style={{ fontSize: 20, fontWeight: 600, color: theme.pageText, textAlign: 'center' }}
      >
        <Trans>Import Complete</Trans>
      </Text>

      {/* Stats */}
      <View
        style={{
          flexDirection: 'row',
          gap: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <StatCard
          label={t('Imported')}
          value={result.imported}
          color='#10b981'
        />
        <StatCard
          label={t('Skipped')}
          value={result.skipped}
          color={theme.pageTextSubdued}
        />
        {result.contracts_detected > 0 && (
          <StatCard
            label={t('Contracts detected')}
            value={result.contracts_detected}
            color='#3b82f6'
          />
        )}
      </View>

      {/* Message */}
      <View
        style={{
          backgroundColor: theme.tableBackground,
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 8,
          padding: '14px 20px',
          maxWidth: 440,
          textAlign: 'center',
        }}
      >
        <Text style={{ fontSize: 14, color: theme.pageText, lineHeight: '1.5' }}>
          {t(
            '{{imported}} transactions imported. {{skipped}} skipped (duplicates or errors). Check the Review Queue for any items that need attention.',
            {
              imported: result.imported,
              skipped: result.skipped,
            },
          )}
        </Text>
      </View>

      {/* Detected recurring patterns */}
      {(detecting || (detected && detected.detected > 0)) && (
        <View
          style={{
            width: '100%',
            maxWidth: 500,
            backgroundColor: `#3b82f608`,
            border: `1px solid #3b82f640`,
            borderRadius: 8,
            padding: '16px 20px',
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: 600, color: theme.pageText }}>
            {detecting
              ? t('Scanning for recurring patterns…')
              : t('{{n}} recurring pattern(s) found', { n: detected!.detected })}
          </Text>

          {!detecting && detected && detected.contracts.length > 0 && (
            <View style={{ gap: 8 }}>
              {detected.contracts.slice(0, 5).map((contract, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: theme.tableBackground,
                    borderRadius: 6,
                    border: `1px solid ${theme.tableBorder}`,
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: theme.pageText,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {contract.name}
                    </Text>
                    {contract.amount != null && contract.interval && (
                      <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                        {formatEurCents(contract.amount)} / {contract.interval}
                      </Text>
                    )}
                  </View>
                  <Button
                    variant="primary"
                    isDisabled={creatingId !== null}
                    onPress={() => void handleCreateContract(contract, idx)}
                    style={{ fontSize: 11, padding: '4px 12px' }}
                  >
                    <Trans>Create contract</Trans>
                  </Button>
                </View>
              ))}
              {detected.contracts.length > 5 && (
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued, textAlign: 'center' }}>
                  {t('+{{n}} more patterns', { n: detected.contracts.length - 5 })}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* CTAs */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button variant="primary" onPress={() => void navigate('/review')}>
          <Trans>Go to Review Queue</Trans>
        </Button>
        <Button variant="normal" onPress={() => void navigate('/accounts')}>
          <Trans>View Transactions</Trans>
        </Button>
        <Button variant="bare" onPress={onReset}>
          <Trans>Import More</Trans>
        </Button>
      </View>
    </View>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 8,
        padding: '12px 20px',
        minWidth: 100,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: 700, color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.pageTextSubdued, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}
