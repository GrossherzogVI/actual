// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
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

import { CancellationInfo } from './CancellationInfo';
import { ContractForm } from './ContractForm';
import { ContractHealthBadge } from './ContractHealthBadge';
import { PriceHistoryTimeline } from './PriceHistoryTimeline';
import {
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_COLORS,
  EMPTY_CONTRACT_FORM,
  formatAmountEur,
} from './types';
import type {
  ContractEntity,
  ContractFormData,
  PriceHistoryItem,
} from './types';

type TabId = 'overview' | 'price-history' | 'notes';

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        padding: '8px 16px',
        border: 'none',
        borderBottom: active
          ? `2px solid ${theme.buttonPrimaryBackground}`
          : '2px solid transparent',
        backgroundColor: 'transparent',
        color: active ? theme.pageText : theme.pageTextSubdued,
        fontWeight: active ? 600 : 400,
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: `${color}20`,
        color,
        textTransform: 'capitalize',
      }}
    >
      {label}
    </Text>
  );
}

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
    await (send as Function)('contract-update', {
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
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button
          variant="primary"
          onPress={handleSave}
          isDisabled={saving}
        >
          {saving ? <Trans>Saving…</Trans> : <Trans>Save notes</Trans>}
        </Button>
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
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEditing, setIsEditing] = useState(isNew);

  const loadContract = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    const result = await (send as Function)('contract-get', { id });
    if (result && !('error' in result)) {
      setContract(result as ContractEntity);
    } else {
      setLoadError(result?.error ?? t('Contract not found'));
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
        const result = await (send as Function)('contract-create', {
          name: formData.name.trim(),
          provider: formData.provider.trim() || undefined,
          type: formData.type || undefined,
          amount: amountCents,
          interval: formData.interval || undefined,
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
        });
        if (result && 'error' in result) {
          setSaveError(result.error);
          setSaving(false);
          return;
        }
        navigate('/contracts');
      } else {
        const result = await (send as Function)('contract-update', {
          id,
          data: {
            name: formData.name.trim(),
            provider: formData.provider.trim() || null,
            type: formData.type || null,
            amount: amountCents ?? null,
            interval: formData.interval || null,
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
          },
        });
        if (result && 'error' in result) {
          setSaveError(result.error);
          setSaving(false);
          return;
        }
        setContract(result as ContractEntity);
        setIsEditing(false);
      }
      setSaving(false);
    },
    [id, isNew, navigate, t],
  );

  const handleDelete = useCallback(async () => {
    if (!id || isNew) return;
    if (!window.confirm(t('Are you sure you want to delete this contract?'))) return;
    await (send as Function)('contract-delete', { id });
    navigate('/contracts');
  }, [id, isNew, navigate, t]);

  const handleCancelContract = useCallback(async () => {
    if (!id || isNew) return;
    if (!window.confirm(t('Mark this contract as cancelled?'))) return;
    const result = await (send as Function)('contract-update', {
      id,
      data: { status: 'cancelled' },
    });
    if (result && !('error' in result)) {
      setContract(result as ContractEntity);
    }
  }, [id, isNew, t]);

  const handleNotesSaved = useCallback((notes: string) => {
    setContract(prev => (prev ? { ...prev, notes: notes || null } : prev));
  }, []);

  // ── Feature flag guard ──────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <Page header={t('Contract')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Contract management is not enabled. Enable it in Settings > Feature Flags.')}
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
          <Text style={{ color: theme.pageTextSubdued }}>{t('Loading…')}</Text>
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
      {/* Header row with health, status, actions */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {contract.type && (
          <StatusBadge
            label={contract.type}
            color={CONTRACT_TYPE_COLORS[contract.type] ?? '#6b7280'}
          />
        )}
        <StatusBadge
          label={contract.status}
          color={CONTRACT_STATUS_COLORS[contract.status] ?? '#6b7280'}
        />
        {contract.health && (
          <ContractHealthBadge health={contract.health} />
        )}
        <View style={{ flex: 1 }} />
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
      </View>

      {/* Key metrics row */}
      {contract.amount != null && (
        <View
          style={{
            flexDirection: 'row',
            gap: 32,
            marginBottom: 20,
            padding: '12px 16px',
            backgroundColor: theme.tableBackground,
            borderRadius: 6,
            border: `1px solid ${theme.tableBorder}`,
            flexWrap: 'wrap',
          }}
        >
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
      )}

      {/* Tab strip */}
      <View
        style={{
          flexDirection: 'row',
          borderBottom: `1px solid ${theme.tableBorder}`,
          marginBottom: 16,
        }}
      >
        <TabButton
          label={t('Overview')}
          active={activeTab === 'overview'}
          onPress={() => setActiveTab('overview')}
        />
        <TabButton
          label={t('Price History')}
          active={activeTab === 'price-history'}
          onPress={() => setActiveTab('price-history')}
        />
        <TabButton
          label={t('Notes')}
          active={activeTab === 'notes'}
          onPress={() => setActiveTab('notes')}
        />
      </View>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <View style={{ maxWidth: 560 }}>
          <CancellationInfo contract={contract} />

          {(contract.counterparty || contract.iban || contract.payment_account_id) && (
            <View
              style={{
                marginTop: 16,
                padding: '12px 16px',
                backgroundColor: theme.tableBackground,
                borderRadius: 6,
                border: `1px solid ${theme.tableBorder}`,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.pageTextSubdued,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                }}
              >
                <Trans>Payment details</Trans>
              </Text>
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
            </View>
          )}

          {contract.tags && contract.tags.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text
                style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 4 }}
              >
                <Trans>Tags</Trans>
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {contract.tags.map(tag => (
                  <Text
                    key={tag}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 10,
                      backgroundColor: `${theme.tableBorder}`,
                      color: theme.pageTextSubdued,
                    }}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {activeTab === 'price-history' && (
        <PriceHistoryTimeline items={priceHistory} />
      )}

      {activeTab === 'notes' && (
        <View style={{ maxWidth: 560 }}>
          <NotesEditor
            notes={contract.notes}
            contractId={contract.id}
            onSaved={handleNotesSaved}
          />
        </View>
      )}
    </Page>
  );
}
