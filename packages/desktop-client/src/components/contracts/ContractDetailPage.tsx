// @ts-strict-ignore
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';
import { PAYMENT_METHOD_LABELS } from 'loot-core/shared/deadlines';
import type { DeadlineResult } from 'loot-core/shared/deadlines';

import { CancellationInfo } from './CancellationInfo';
import { ContractForm } from './ContractForm';
import { ContractHealthBadge } from './ContractHealthBadge';
import { DeadlineBadge } from './DeadlineBadge';
import { PriceHistoryTimeline } from './PriceHistoryTimeline';
import {
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_COLORS,
  daysUntil,
  EMPTY_CONTRACT_FORM,
  formatAmountEur,
} from './types';
import type {
  ContractEntity,
  ContractFormData,
  PriceHistoryItem,
} from './types';

import { ConfirmDialog } from '@desktop-client/components/common/ConfirmDialog';
import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function NotesEditor({
  notes,
  contractId,
  onSaved,
}: {
  notes: string | null;
  contractId: string;
  onSaved: (notes: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await send('contract-update', {
      id: contractId,
      data: { notes: value || null },
    });
    setSaving(false);
    onSaved(value);
  }, [contractId, value, onSaved]);

  return (
    <View style={{ padding: '8px 0' }}>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={t('Add notes about this contract…')}
        rows={6}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 4,
          border: `1px solid ${theme.tableBorder}`,
          backgroundColor: theme.tableBackground,
          color: theme.pageText,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          marginTop: 8,
        }}
      >
        <Button variant="primary" onPress={handleSave} isDisabled={saving}>
          {saving ? <Trans>Saving…</Trans> : <Trans>Save notes</Trans>}
        </Button>
      </View>
    </View>
  );
}

// ─── Kündigungsschreiben Modal ───────────────────────────────────────────────

function buildKuendigungsschreiben(
  contract: ContractEntity,
  senderName: string,
  senderAddress: string,
  today: string,
): string {
  const providerLine = contract.provider ?? contract.name;
  const counterparty = contract.counterparty ?? '';
  const rawStartDate = contract.start_date ?? '';
  const startDate = rawStartDate
    ? new Date(rawStartDate + 'T00:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';
  const ref = contract.iban ?? contract.id.slice(0, 8).toUpperCase();

  return [
    senderName,
    senderAddress,
    '',
    providerLine,
    counterparty ? counterparty : '',
    '',
    today,
    '',
    `Betreff: Kündigung des Vertrages – ${contract.name}`,
    '',
    `Sehr geehrte Damen und Herren,`,
    '',
    `hiermit kündige ich den oben genannten Vertrag${startDate ? ` (Vertragsbeginn: ${startDate})` : ''}`,
    `zum nächstmöglichen Termin, hilfsweise zum nächst zulässigen Termin.`,
    '',
    `Vertragsreferenz: ${ref}`,
    '',
    `Ich bitte um eine schriftliche Bestätigung der Kündigung sowie`,
    `die Nennung des genauen Kündigungstermins.`,
    '',
    `Mit freundlichen Grüßen`,
    '',
    senderName,
  ]
    .filter(line => line !== undefined)
    .join('\n');
}

function KuendigungsschreibenModal({
  contract,
  onClose,
}: {
  contract: ContractEntity;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const [senderName, setSenderName] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [copied, setCopied] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const letterText = buildKuendigungsschreiben(
    contract,
    senderName || t('Ihr Name'),
    senderAddress || t('Ihre Adresse'),
    today,
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silently ignore
    }
  }, [letterText]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <View
      ref={backdropRef}
      onMouseDown={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 580,
          maxHeight: '90vh',
          backgroundColor: theme.modalBackground,
          border: `1px solid ${theme.modalBorder}`,
          borderRadius: 10,
          boxShadow: '0 16px 60px rgba(0,0,0,.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px 10px',
            borderBottom: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: 700 }}>
            <Trans>Kündigungsschreiben</Trans>
          </Text>
          <Button
            variant="bare"
            onPress={onClose}
            style={{ fontSize: 18, padding: '2px 8px' }}
          >
            ×
          </Button>
        </View>

        {/* Sender inputs */}
        <View
          style={{
            padding: '12px 18px',
            gap: 8,
            borderBottom: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: theme.pageTextSubdued,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            <Trans>Your details (sender)</Trans>
          </Text>
          <input
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            placeholder={t('Full name')}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 4,
              border: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.formInputBackground,
              color: theme.formInputText,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <input
            value={senderAddress}
            onChange={e => setSenderAddress(e.target.value)}
            placeholder={t('Street, City, ZIP')}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 4,
              border: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.formInputBackground,
              color: theme.formInputText,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </View>

        {/* Notice period & earliest cancellation info */}
        {(contract.notice_period_months || contract.cancellation_deadline) && (
          <View
            style={{
              padding: '10px 18px',
              backgroundColor: `${theme.tableBackground}`,
              borderBottom: `1px solid ${theme.tableBorder}`,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: theme.pageTextSubdued,
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              <Trans>Cancellation details</Trans>
            </Text>
            {contract.notice_period_months != null && (
              <Text
                style={{ fontSize: 12, color: theme.pageText, marginBottom: 3 }}
              >
                {t('Notice period: {{n}} month(s)', {
                  n: contract.notice_period_months,
                })}
              </Text>
            )}
            {contract.cancellation_deadline && (
              <Text style={{ fontSize: 12, color: theme.pageText }}>
                {t('Earliest cancellation date: {{date}}', {
                  date: new Date(
                    contract.cancellation_deadline,
                  ).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }),
                })}
                {(() => {
                  const days = daysUntil(contract.cancellation_deadline);
                  if (days !== null && days >= 0) {
                    return ` (${t('{{n}} days left', { n: days })})`;
                  }
                  if (days !== null && days < 0) {
                    return ` (${t('passed')})`;
                  }
                  return '';
                })()}
              </Text>
            )}
          </View>
        )}

        {/* Letter preview */}
        <View style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
          <pre
            style={{
              margin: 0,
              fontSize: 13,
              fontFamily: '"Courier New", monospace',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              color: theme.pageText,
            }}
          >
            {letterText}
          </pre>
        </View>

        {/* Footer */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 18px',
            borderTop: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Button variant="bare" onPress={onClose}>
            <Trans>Close</Trans>
          </Button>
          <Button variant="primary" onPress={handleCopy}>
            {copied ? <Trans>Copied!</Trans> : <Trans>Copy to clipboard</Trans>}
          </Button>
        </View>
      </View>
    </View>
  );
}

// ─── Payment Deadlines Section ───────────────────────────────────────────────

type DeadlineApiResult = {
  deadlines: DeadlineResult;
  paymentMethod: string;
  gracePeriodDays: number;
  showHardDeadline: boolean;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function daysFromToday(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function DeadlineRow({
  label,
  date,
  days,
  color,
}: {
  label: string;
  date: string;
  days: number;
  color?: string;
}) {
  const { t } = useTranslation();
  const countdownText =
    days === 0
      ? t('heute')
      : days > 0
        ? t('in {{n}} Tag(en)', { n: days })
        : t('{{n}} Tag(e) überfällig', { n: Math.abs(days) });

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        marginBottom: 6,
        alignItems: 'baseline',
      }}
    >
      <Text
        style={{ fontSize: 12, color: theme.pageTextSubdued, minWidth: 160 }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: color ?? theme.pageText,
        }}
      >
        {formatDate(date)}
      </Text>
      <Text style={{ fontSize: 12, color: color ?? theme.pageTextSubdued }}>
        — {countdownText}
      </Text>
    </View>
  );
}

function PaymentDeadlineSection({ contractId }: { contractId: string }) {
  const { t } = useTranslation();
  const [globalShowHard] = useSyncedPref('deadlineShowHard');
  const [result, setResult] = useState<DeadlineApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    send('contract-deadlines', { id: contractId })
      .then((res: any) => {
        if (cancelled) return;
        if (res && 'error' in res) {
          setError(res.error);
        } else if (res) {
          setResult(res as DeadlineApiResult);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('Fristen konnten nicht geladen werden'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contractId, t]);

  const showHard = result?.showHardDeadline ?? globalShowHard === 'true';

  const today = new Date().toISOString().slice(0, 10);

  function getStatus(): 'ok' | 'action_due' | 'soft_passed' | 'hard_passed' {
    if (!result) return 'ok';
    const d = result.deadlines;
    if (today > d.hard) return 'hard_passed';
    if (today > d.soft) return 'soft_passed';
    if (today >= d.action) return 'action_due';
    return 'ok';
  }

  if (loading) {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
          <Trans>Fristen werden geladen…</Trans>
        </Text>
      </View>
    );
  }

  if (error || !result) {
    // Silently omit the section if no deadline data (contract may not have payment_method set)
    return null;
  }

  const { deadlines, paymentMethod, gracePeriodDays } = result;
  const status = getStatus();
  const actionDays = daysFromToday(deadlines.action);
  const softDays = daysFromToday(deadlines.soft);
  const hardDays = daysFromToday(deadlines.hard);

  const softColor = status === 'soft_passed' ? '#f59e0b' : undefined;
  const hardColor = status === 'hard_passed' ? '#ef4444' : undefined;
  const actionColor = status === 'action_due' ? '#3b82f6' : undefined;

  const methodLabel =
    (PAYMENT_METHOD_LABELS as Record<string, string>)[paymentMethod] ??
    paymentMethod;

  return (
    <View
      style={{
        marginTop: 16,
        padding: '12px 16px',
        backgroundColor: theme.tableBackground,
        borderRadius: 6,
        border: `1px solid ${theme.tableBorder}`,
      }}
    >
      {/* Header with badge */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.pageTextSubdued,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <Trans>Zahlungsfristen</Trans>
        </Text>
        {status !== 'ok' && (
          <DeadlineBadge
            status={status}
            daysRelative={
              status === 'action_due'
                ? actionDays
                : status === 'soft_passed'
                  ? softDays
                  : hardDays
            }
          />
        )}
      </View>

      {/* Deadline rows */}
      <DeadlineRow
        label={t('Überweise bis')}
        date={deadlines.action}
        days={actionDays}
        color={actionColor}
      />
      <DeadlineRow
        label={t('Fällig am (weich)')}
        date={deadlines.soft}
        days={softDays}
        color={softColor}
      />
      {showHard && (
        <DeadlineRow
          label={t('Letzte Frist (hart)')}
          date={deadlines.hard}
          days={hardDays}
          color={hardColor}
        />
      )}

      {/* Meta row */}
      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          marginTop: 8,
          flexWrap: 'wrap',
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            <Trans>Zahlungsmethode</Trans>:
          </Text>
          <Badge variant="secondary" className="text-xs">
            {methodLabel}
          </Badge>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            <Trans>Kulanzzeit</Trans>:
          </Text>
          <Text style={{ fontSize: 11, color: theme.pageText }}>
            {t('{{n}} Werktage', { n: gracePeriodDays })}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ContractDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const enabled = useFeatureFlag('contractManagement');
  const navigate = useNavigate();

  const [contract, setContract] = useState<ContractEntity | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(isNew);
  const [showKuendigung, setShowKuendigung] = useState(false);

  const loadContract = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    const result = await send('contract-get', { id });
    if (result && !('error' in result)) {
      setContract(result as ContractEntity);
    } else {
      const errMsg =
        result && typeof result === 'object' && 'error' in result
          ? (result as { error: string }).error
          : t('Contract not found');
      setLoadError(errMsg);
    }
    setLoading(false);
  }, [id, isNew, t]);

  useEffect(() => {
    void loadContract();
  }, [loadContract]);

  const handleSave = useCallback(
    async (formData: ContractFormData) => {
      if (!formData.name.trim()) {
        setSaveError(t('Name is required'));
        return;
      }

      setSaving(true);
      setSaveError(null);

      const amountCents = formData.amount
        ? Math.round(parseFloat(formData.amount) * 100)
        : undefined;

      if (isNew) {
        const result = await send('contract-create', {
          name: formData.name.trim(),
          provider: formData.provider.trim() || undefined,
          type: formData.type || undefined,
          amount: amountCents,
          interval: formData.interval || undefined,
          category_id: formData.category_id || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          notice_period_months: formData.notice_period_months
            ? parseInt(formData.notice_period_months, 10)
            : undefined,
          auto_renewal: formData.auto_renewal,
          currency: formData.currency || 'EUR',
          payment_account_id: formData.payment_account_id || undefined,
          iban: formData.iban.trim() || undefined,
          counterparty: formData.counterparty.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          tags: (formData as any).tags ?? [],
          payment_method: formData.payment_method || undefined,
          grace_period_days: formData.grace_period_days
            ? parseInt(formData.grace_period_days, 10)
            : undefined,
          soft_shift: formData.soft_shift || undefined,
          hard_shift: formData.hard_shift || undefined,
          lead_time_override: formData.lead_time_override
            ? parseInt(formData.lead_time_override, 10)
            : undefined,
          show_hard_deadline: formData.show_hard_deadline,
        });
        if (result && 'error' in result) {
          setSaveError(String(result.error));
          setSaving(false);
          return;
        }
        navigate('/contracts');
      } else {
        const result = await send('contract-update', {
          id,
          data: {
            name: formData.name.trim(),
            provider: formData.provider.trim() || null,
            type: formData.type || null,
            amount: amountCents ?? null,
            interval: formData.interval || null,
            category_id: formData.category_id || null,
            start_date: formData.start_date || null,
            end_date: formData.end_date || null,
            notice_period_months: formData.notice_period_months
              ? parseInt(formData.notice_period_months, 10)
              : null,
            auto_renewal: formData.auto_renewal,
            currency: formData.currency || 'EUR',
            payment_account_id: formData.payment_account_id || null,
            iban: formData.iban.trim() || null,
            counterparty: formData.counterparty.trim() || null,
            notes: formData.notes.trim() || null,
            tags: (formData as any).tags ?? [],
            payment_method: formData.payment_method || null,
            grace_period_days: formData.grace_period_days
              ? parseInt(formData.grace_period_days, 10)
              : null,
            soft_shift: formData.soft_shift || null,
            hard_shift: formData.hard_shift || null,
            lead_time_override: formData.lead_time_override
              ? parseInt(formData.lead_time_override, 10)
              : null,
            show_hard_deadline: formData.show_hard_deadline,
          } as unknown as Partial<
            Omit<ContractEntity, 'id' | 'created_at' | 'updated_at'>
          >,
        });
        if (result && 'error' in result) {
          setSaveError(String(result.error));
          setSaving(false);
          return;
        }
        setContract(result as unknown as ContractEntity);
        setIsEditing(false);
      }
      setSaving(false);
    },
    [id, isNew, navigate, t],
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleDelete = useCallback(() => {
    if (!id || isNew) return;
    setShowDeleteConfirm(true);
  }, [id, isNew]);

  const confirmDelete = useCallback(async () => {
    if (!id) return;
    const result = await send('contract-delete', { id });
    if (result && 'error' in result) {
      setSaveError(result.error);
      return;
    }
    navigate('/contracts');
  }, [id, navigate]);

  const handleCancelContract = useCallback(() => {
    if (!id || isNew) return;
    setShowCancelConfirm(true);
  }, [id, isNew]);

  const confirmCancelContract = useCallback(async () => {
    if (!id) return;
    const result = await send('contract-update', {
      id,
      data: { status: 'cancelled' },
    });
    if (result && 'error' in result) {
      setSaveError(result.error);
    } else if (result) {
      setContract(result as ContractEntity);
    }
  }, [id]);

  const handleNotesSaved = useCallback((notes: string) => {
    setContract(prev => (prev ? { ...prev, notes: notes || null } : prev));
  }, []);

  // ── Feature flag guard ──────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <Page header={t('Contract')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t(
              'Contract management is not enabled. Enable it in Settings > Feature Flags.',
            )}
          </Text>
        </View>
      </Page>
    );
  }

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <Page header={t('Contract')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>Loading…</Trans>
          </Text>
        </View>
      </Page>
    );
  }

  if (loadError) {
    return (
      <Page header={t('Contract')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.errorText }}>{loadError}</Text>
          <Button
            onPress={() => navigate('/contracts')}
            style={{ marginTop: 12 }}
          >
            <Trans>Back to contracts</Trans>
          </Button>
        </View>
      </Page>
    );
  }

  // ── New contract — just show the form ──────────────────────────────────────
  if (isNew) {
    return (
      <Page header={t('New Contract')}>
        <ContractForm
          isNew
          saving={saving}
          error={saveError}
          onSave={handleSave}
        />
      </Page>
    );
  }

  // ── Edit mode for existing contract ───────────────────────────────────────
  if (isEditing && contract) {
    const initialData: ContractFormData = {
      ...EMPTY_CONTRACT_FORM,
      name: contract.name ?? '',
      provider: contract.provider ?? '',
      type: contract.type ?? '',
      amount: contract.amount != null ? String(contract.amount / 100) : '',
      interval: contract.interval ?? 'monthly',
      category_id: contract.category_id ?? '',
      start_date: contract.start_date ?? '',
      end_date: contract.end_date ?? '',
      notice_period_months:
        contract.notice_period_months != null
          ? String(contract.notice_period_months)
          : '',
      auto_renewal: contract.auto_renewal ?? false,
      currency: contract.currency ?? 'EUR',
      payment_account_id: contract.payment_account_id ?? '',
      iban: contract.iban ?? '',
      counterparty: contract.counterparty ?? '',
      notes: contract.notes ?? '',
      payment_method: contract.payment_method ?? 'manual_sepa',
      grace_period_days:
        contract.grace_period_days != null
          ? String(contract.grace_period_days)
          : '5',
      soft_shift: contract.soft_deadline_shift ?? 'before',
      hard_shift: contract.hard_deadline_shift ?? 'after',
      lead_time_override:
        contract.lead_time_override != null
          ? String(contract.lead_time_override)
          : '',
      show_hard_deadline: contract.show_hard_deadline ?? false,
    };

    return (
      <Page header={t('Edit Contract')}>
        <ContractForm
          isNew={false}
          initialData={initialData}
          contract={contract}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancelContract={handleCancelContract}
        />
      </Page>
    );
  }

  // ── View mode — tabbed detail ──────────────────────────────────────────────
  if (!contract) return null;

  const priceHistory = (contract.price_history ?? []) as PriceHistoryItem[];

  return (
    <Page header={contract.name}>
      {showKuendigung && (
        <KuendigungsschreibenModal
          contract={contract}
          onClose={() => setShowKuendigung(false)}
        />
      )}
      {/* Header row with health, status, actions */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {contract.type && (
          <Badge variant="outline" className="capitalize">
            {contract.type}
          </Badge>
        )}
        <Badge variant="outline" className="gap-1.5 capitalize">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CONTRACT_STATUS_COLORS[contract.status] ?? '#6b7280' }}
          />
          {contract.status}
        </Badge>
        {contract.health && <ContractHealthBadge health={contract.health} />}
        <View style={{ flex: 1 }} />
        <Button onPress={() => setShowKuendigung(true)}>
          <Trans>Kündigungsschreiben</Trans>
        </Button>
        <Button onPress={() => setIsEditing(true)}>
          <Trans>Edit</Trans>
        </Button>
        {contract.status === 'active' && (
          <Button onPress={handleCancelContract}>
            <Trans>Cancel contract</Trans>
          </Button>
        )}
        <Button
          variant="bare"
          onPress={handleDelete}
          style={{ color: theme.errorText }}
        >
          <Trans>Delete</Trans>
        </Button>
      </div>

      {/* Key metrics row */}
      {contract.amount != null && (
        <Card className="mb-5">
          <CardContent className="pt-4">
            <View style={{ flexDirection: 'row', gap: 32, flexWrap: 'wrap' }}>
              <View>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 2 }}>
                  <Trans>Amount</Trans>
                </Text>
                <Text style={{ fontSize: 18, fontWeight: 700 }}>
                  €{formatAmountEur(contract.amount)}/{contract.interval ?? ''}
                </Text>
              </View>
              {contract.annual_cost != null && (
                <View>
                  <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 2 }}>
                    <Trans>Annual cost</Trans>
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: 700 }}>
                    €{formatAmountEur(contract.annual_cost)}
                  </Text>
                </View>
              )}
              {contract.provider && (
                <View>
                  <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 2 }}>
                    <Trans>Provider</Trans>
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: 500 }}>{contract.provider}</Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('Overview')}</TabsTrigger>
          <TabsTrigger value="price-history">{t('Price History')}</TabsTrigger>
          <TabsTrigger value="notes">{t('Notes')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <View style={{ maxWidth: 560 }}>
            <CancellationInfo contract={contract} />
            <PaymentDeadlineSection contractId={contract.id} />

            {(contract.counterparty || contract.iban || contract.payment_account_id) && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
                    <Trans>Payment details</Trans>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {contract.counterparty && (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.pageTextSubdued, minWidth: 120 }}>
                        <Trans>Counterparty</Trans>
                      </Text>
                      <Text style={{ fontSize: 13 }}>{contract.counterparty}</Text>
                    </View>
                  )}
                  {contract.iban && (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.pageTextSubdued, minWidth: 120 }}>
                        IBAN
                      </Text>
                      <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>{contract.iban}</Text>
                    </View>
                  )}
                </CardContent>
              </Card>
            )}

            {contract.tags && contract.tags.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 4 }}>
                  <Trans>Tags</Trans>
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {contract.tags.map(tag => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </View>
            )}
          </View>
        </TabsContent>

        <TabsContent value="price-history">
          <PriceHistoryTimeline items={priceHistory} />
        </TabsContent>

        <TabsContent value="notes">
          <View style={{ maxWidth: 560 }}>
            <NotesEditor
              notes={contract.notes}
              contractId={contract.id}
              onSaved={handleNotesSaved}
            />
          </View>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('Delete contract')}
        message={t('Are you sure you want to delete this contract? This cannot be undone.')}
        confirmLabel={t('Delete')}
        variant="destructive"
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title={t('Cancel contract')}
        message={t('Mark this contract as cancelled?')}
        confirmLabel={t('Cancel contract')}
        onConfirm={confirmCancelContract}
      />
    </Page>
  );
}
