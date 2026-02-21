// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';
import type { ContractEntity } from 'loot-core/server/contracts/app';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

const CONTRACT_TYPES = [
  { value: '', label: 'Select type...' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'rent', label: 'Rent' },
  { value: 'utility', label: 'Utility' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'tax', label: 'Tax' },
  { value: 'loan', label: 'Loan' },
  { value: 'other', label: 'Other' },
] as const;

const FREQUENCIES = [
  { value: '', label: 'Select frequency...' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

type FormData = {
  name: string;
  provider: string;
  type: string;
  amount: string;
  frequency: string;
  start_date: string;
  end_date: string;
  cancellation_period_days: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  name: '',
  provider: '',
  type: '',
  amount: '',
  frequency: 'monthly',
  start_date: '',
  end_date: '',
  cancellation_period_days: '',
  notes: '',
};

export function ContractDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const enabled = useFeatureFlag('contractManagement');
  const [budgetId] = useMetadataPref('id');
  const navigate = useNavigate();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [contract, setContract] = useState<ContractEntity | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  const loadContract = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    const result = await (send as Function)('contract-get', { id });
    if (result && !('error' in result)) {
      const c = result as ContractEntity;
      setContract(c);
      setForm({
        name: c.name || '',
        provider: c.provider || '',
        type: c.type || '',
        amount: c.amount != null ? String(c.amount / 100) : '',
        frequency: c.frequency || 'monthly',
        start_date: c.start_date || '',
        end_date: c.end_date || '',
        cancellation_period_days:
          c.cancellation_period_days != null
            ? String(c.cancellation_period_days)
            : '',
        notes: c.notes || '',
      });
    } else {
      setError(t('Contract not found'));
    }
    setLoading(false);
  }, [id, isNew, t]);

  useEffect(() => {
    void loadContract();
  }, [loadContract]);

  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setForm(prev => ({ ...prev, [field]: value }));
      setError(null);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      setError(t('Name is required'));
      return;
    }

    setSaving(true);
    setError(null);

    const amountCents = form.amount ? Math.round(parseFloat(form.amount) * 100) : undefined;

    if (isNew) {
      const result = await (send as Function)('contract-create', {
        name: form.name.trim(),
        file_id: budgetId,
        provider: form.provider.trim() || undefined,
        type: form.type || undefined,
        amount: amountCents,
        frequency: form.frequency || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        cancellation_period_days: form.cancellation_period_days
          ? parseInt(form.cancellation_period_days, 10)
          : undefined,
        notes: form.notes.trim() || undefined,
      });
      if (result && 'error' in result) {
        setError(result.error);
        setSaving(false);
        return;
      }
      navigate('/contracts');
    } else {
      const result = await (send as Function)('contract-update', {
        id,
        data: {
          name: form.name.trim(),
          provider: form.provider.trim() || null,
          type: form.type || null,
          amount: amountCents ?? null,
          frequency: form.frequency || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          cancellation_period_days: form.cancellation_period_days
            ? parseInt(form.cancellation_period_days, 10)
            : null,
          notes: form.notes.trim() || null,
        },
      });
      if (result && 'error' in result) {
        setError(result.error);
        setSaving(false);
        return;
      }
      navigate('/contracts');
    }
    setSaving(false);
  }, [form, isNew, id, budgetId, navigate, t]);

  const handleDelete = useCallback(async () => {
    if (!id || isNew) return;
    if (!window.confirm(t('Are you sure you want to delete this contract?'))) return;

    setDeleting(true);
    await (send as Function)('contract-delete', { id });
    navigate('/contracts');
  }, [id, isNew, navigate, t]);

  const handleCancelContract = useCallback(async () => {
    if (!id || isNew) return;
    setSaving(true);
    await (send as Function)('contract-update', {
      id,
      data: { status: 'cancelled' },
    });
    navigate('/contracts');
  }, [id, isNew, navigate]);

  if (!enabled) {
    return (
      <Page header={t('Contract')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Contract management is not enabled.')}
          </Text>
        </View>
      </Page>
    );
  }

  if (loading) {
    return (
      <Page header={t('Contract')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>{t('Loading...')}</Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={isNew ? t('New Contract') : t('Edit Contract')}>
      <View style={{ maxWidth: 600, padding: '0 0 20px' }}>
        {error && (
          <View
            style={{
              padding: '8px 12px',
              marginBottom: 15,
              backgroundColor: `${theme.errorText}15`,
              borderRadius: 4,
              border: `1px solid ${theme.errorText}40`,
            }}
          >
            <Text style={{ color: theme.errorText, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!isNew && contract && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 15,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              <Trans>Status</Trans>:
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {contract.status.replace('_', ' ')}
            </Text>
          </View>
        )}

        <FormField label={t('Name')} required>
          <Input
            value={form.name}
            onChangeValue={v => updateField('name', v)}
            placeholder={t('Contract name')}
          />
        </FormField>

        <FormField label={t('Provider')}>
          <Input
            value={form.provider}
            onChangeValue={v => updateField('provider', v)}
            placeholder={t('Provider name')}
          />
        </FormField>

        <FormField label={t('Type')}>
          <select
            value={form.type}
            onChange={e => updateField('type', e.target.value)}
            style={selectStyle}
          >
            {CONTRACT_TYPES.map(opt => (
              <option key={opt.value} value={opt.value}>
                {t(opt.label)}
              </option>
            ))}
          </select>
        </FormField>

        <View style={{ flexDirection: 'row', gap: 15 }}>
          <FormField label={t('Amount')} style={{ flex: 1 }}>
            <Input
              value={form.amount}
              onChangeValue={v => updateField('amount', v)}
              placeholder="0.00"
              type="number"
              step="0.01"
            />
          </FormField>

          <FormField label={t('Frequency')} style={{ flex: 1 }}>
            <select
              value={form.frequency}
              onChange={e => updateField('frequency', e.target.value)}
              style={selectStyle}
            >
              {FREQUENCIES.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
            </select>
          </FormField>
        </View>

        <View style={{ flexDirection: 'row', gap: 15 }}>
          <FormField label={t('Start date')} style={{ flex: 1 }}>
            <Input
              value={form.start_date}
              onChangeValue={v => updateField('start_date', v)}
              type="date"
            />
          </FormField>

          <FormField label={t('End date')} style={{ flex: 1 }}>
            <Input
              value={form.end_date}
              onChangeValue={v => updateField('end_date', v)}
              type="date"
            />
          </FormField>
        </View>

        <FormField label={t('Cancellation period (days)')}>
          <Input
            value={form.cancellation_period_days}
            onChangeValue={v => updateField('cancellation_period_days', v)}
            type="number"
            placeholder="30"
          />
        </FormField>

        <FormField label={t('Notes')}>
          <textarea
            value={form.notes}
            onChange={e => updateField('notes', e.target.value)}
            placeholder={t('Additional notes...')}
            rows={3}
            style={{
              ...selectStyle,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </FormField>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 20,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!isNew && (
              <>
                <Button
                  variant="bare"
                  onPress={handleDelete}
                  isDisabled={deleting}
                  style={{ color: theme.errorText }}
                >
                  <Trans>Delete</Trans>
                </Button>
                {contract?.status === 'active' && (
                  <Button variant="bare" onPress={handleCancelContract}>
                    <Trans>Cancel contract</Trans>
                  </Button>
                )}
              </>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button onPress={() => navigate('/contracts')}>
              <Trans>Back</Trans>
            </Button>
            <ButtonWithLoading
              variant="primary"
              isLoading={saving}
              onPress={handleSave}
            >
              {isNew ? <Trans>Create</Trans> : <Trans>Save</Trans>}
            </ButtonWithLoading>
          </View>
        </View>
      </View>
    </Page>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 4,
  border: `1px solid #ccc`,
  backgroundColor: '#fff',
  fontSize: 13,
  width: '100%',
};

function FormField({
  label,
  required,
  style,
  children,
}: {
  label: string;
  required?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 12, ...style }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: theme.pageTextSubdued,
          marginBottom: 4,
        }}
      >
        {label}
        {required && <span style={{ color: theme.errorText }}> *</span>}
      </Text>
      {children}
    </View>
  );
}
