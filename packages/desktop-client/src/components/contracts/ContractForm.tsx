// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { Toggle } from '@actual-app/components/toggle';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useCategories } from '@desktop-client/hooks/useCategories';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import {
  CONTRACT_INTERVAL_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  EMPTY_CONTRACT_FORM,
} from './types';
import type { ContractEntity, ContractFormData } from './types';
import { SUGGESTED_TAGS } from './ContractsPage';

// ─── Contract templates ───────────────────────────────────────────────────────

type ContractTemplate = {
  id: string;
  label: string;
  emoji: string;
  data: Partial<ContractFormData>;
};

const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: 'mietvertrag',
    label: 'Mietvertrag',
    emoji: '🏠',
    data: {
      type: 'rent',
      interval: 'monthly',
      notice_period_months: '3',
      auto_renewal: false,
    },
  },
  {
    id: 'handyvertrag',
    label: 'Handyvertrag',
    emoji: '📱',
    data: {
      type: 'subscription',
      interval: 'monthly',
      notice_period_months: '1',
      auto_renewal: true,
    },
  },
  {
    id: 'stromvertrag',
    label: 'Stromvertrag',
    emoji: '⚡',
    data: {
      type: 'utility',
      interval: 'monthly',
      notice_period_months: '1',
      auto_renewal: true,
    },
  },
  {
    id: 'versicherung',
    label: 'Versicherung',
    emoji: '🛡️',
    data: {
      type: 'insurance',
      interval: 'monthly',
      notice_period_months: '1',
      auto_renewal: true,
    },
  },
  {
    id: 'streaming',
    label: 'Streaming',
    emoji: '🎬',
    data: {
      type: 'subscription',
      interval: 'monthly',
      notice_period_months: '1',
      auto_renewal: true,
    },
  },
  {
    id: 'fitnessstudio',
    label: 'Fitnessstudio',
    emoji: '💪',
    data: {
      type: 'membership',
      interval: 'monthly',
      notice_period_months: '3',
      auto_renewal: true,
    },
  },
];

function TemplatePicker({ onSelect }: { onSelect: (data: Partial<ContractFormData>) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: theme.pageTextSubdued,
          marginBottom: 8,
        }}
      >
        {t('Start from a template')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {CONTRACT_TEMPLATES.map(tmpl => (
          <Button
            key={tmpl.id}
            variant="bare"
            onPress={() => onSelect(tmpl.data)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 20,
              backgroundColor: theme.tableBackground,
              color: theme.pageText,
              fontSize: 12,
            }}
          >
            <span>{tmpl.emoji}</span>
            <span>{tmpl.label}</span>
          </Button>
        ))}
      </View>
    </View>
  );
}

// ─── Tags input ───────────────────────────────────────────────────────────────

function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed || value.includes(trimmed)) return;
      onChange([...value, trimmed]);
    },
    [value, onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter(t => t !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
      setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      {/* Chip display */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          minHeight: 34,
          padding: '4px 8px',
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 4,
          backgroundColor: theme.tableBackground,
          alignItems: 'center',
        }}
      >
        {value.map(tag => (
          <View
            key={tag}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor: `${theme.buttonPrimaryBackground}20`,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.pageText }}>{tag}</Text>
            <Button
              variant="bare"
              onPress={() => removeTag(tag)}
              style={{
                color: theme.pageTextSubdued,
                padding: '0 2px',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </Button>
          </View>
        ))}
        <input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? t('Add tags…') : ''}
          style={{
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: theme.pageText,
            fontSize: 12,
            minWidth: 80,
            flex: 1,
          }}
        />
      </View>

      {/* Suggested tags */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 11, color: theme.pageTextSubdued, alignSelf: 'center' }}>
          {t('Suggestions:')}
        </Text>
        {SUGGESTED_TAGS.filter(s => !value.includes(s)).map(s => (
          <Button
            key={s}
            variant="bare"
            onPress={() => addTag(s)}
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 10,
              backgroundColor: 'transparent',
              color: theme.pageTextSubdued,
              fontSize: 11,
              padding: '1px 8px',
            }}
          >
            {s}
          </Button>
        ))}
      </View>
    </View>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

type ContractFormProps = {
  initialData?: Partial<ContractFormData>;
  contract?: ContractEntity | null;
  saving: boolean;
  error: string | null;
  onSave: (data: ContractFormData) => void;
  onDelete?: () => void;
  onCancelContract?: () => void;
  isNew: boolean;
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
    <View style={{ marginBottom: 14, ...style }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: theme.pageTextSubdued,
          marginBottom: 5,
        }}
      >
        {label}
        {required && (
          <span style={{ color: theme.errorText, marginLeft: 2 }}>*</span>
        )}
      </Text>
      {children}
    </View>
  );
}

const TYPE_SELECT_OPTIONS: [string, string][] = [
  ...CONTRACT_TYPE_OPTIONS,
];

const INTERVAL_SELECT_OPTIONS: [string, string][] = [
  ...CONTRACT_INTERVAL_OPTIONS,
];

const CURRENCY_OPTIONS: [string, string][] = [
  ['EUR', 'EUR — Euro'],
  ['USD', 'USD — Dollar'],
  ['GBP', 'GBP — Pound'],
  ['CHF', 'CHF — Franc'],
];

export function ContractForm({
  initialData,
  contract,
  saving,
  error,
  onSave,
  onDelete,
  onCancelContract,
  isNew,
}: ContractFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: categoryData } = useCategories();

  const categoryOptions = React.useMemo<[string, string][]>(() => {
    const opts: [string, string][] = [['', t('No category')]];
    for (const group of categoryData?.grouped ?? []) {
      for (const cat of group.categories ?? []) {
        opts.push([cat.id, `${group.name}: ${cat.name}`]);
      }
    }
    return opts;
  }, [categoryData, t]);

  const [form, setForm] = React.useState<ContractFormData>({
    ...EMPTY_CONTRACT_FORM,
    ...initialData,
  });

  // tags are stored separately as string[] but ContractFormData uses string fields
  // We manage them as a derived state from form.tags (which we add to the type below)
  const [tags, setTags] = useState<string[]>(
    (initialData as any)?.tags ?? (contract?.tags ?? []),
  );

  const updateField = useCallback(
    <K extends keyof ContractFormData>(field: K, value: ContractFormData[K]) => {
      setForm(prev => ({ ...prev, [field]: value }));
    },
    [],
  );

  const applyTemplate = useCallback((data: Partial<ContractFormData>) => {
    setForm(prev => ({ ...prev, ...data }));
  }, []);

  const handleSave = useCallback(() => {
    onSave({ ...form, tags } as any);
  }, [form, tags, onSave]);

  return (
    <View style={{ maxWidth: 640 }}>
      {/* Error banner */}
      {error && (
        <View
          style={{
            padding: '8px 12px',
            marginBottom: 16,
            backgroundColor: `${theme.errorText}15`,
            borderRadius: 4,
            border: `1px solid ${theme.errorText}40`,
          }}
        >
          <Text style={{ color: theme.errorText, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {/* Template picker — only show for new contracts */}
      {isNew && <TemplatePicker onSelect={applyTemplate} />}

      {/* Status indicator for existing contracts */}
      {!isNew && contract && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
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
              color: theme.pageText,
            }}
          >
            {contract.status}
          </Text>
        </View>
      )}

      {/* Name + Provider */}
      <FormField label={t('Name')} required>
        <Input
          value={form.name}
          onChangeValue={v => updateField('name', v)}
          placeholder={t('e.g. Netflix, Car insurance…')}
        />
      </FormField>

      <FormField label={t('Provider')}>
        <Input
          value={form.provider}
          onChangeValue={v => updateField('provider', v)}
          placeholder={t('Provider name')}
        />
      </FormField>

      {/* Type + Currency in a row */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <FormField label={t('Type')} style={{ flex: 1 }}>
          <Select
            options={TYPE_SELECT_OPTIONS}
            value={form.type}
            defaultLabel={t('Select type…')}
            onChange={v => updateField('type', v)}
            style={{ width: '100%' }}
          />
        </FormField>

        <FormField label={t('Currency')} style={{ flex: 1 }}>
          <Select
            options={CURRENCY_OPTIONS}
            value={form.currency}
            onChange={v => updateField('currency', v)}
            style={{ width: '100%' }}
          />
        </FormField>
      </View>

      {/* Amount + Interval in a row */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <FormField label={t('Amount')} style={{ flex: 1 }}>
          <Input
            value={form.amount}
            onChangeValue={v => updateField('amount', v)}
            placeholder="0.00"
            type="number"
            inputMode="decimal"
          />
        </FormField>

        <FormField label={t('Interval')} style={{ flex: 1 }}>
          <Select
            options={INTERVAL_SELECT_OPTIONS}
            value={form.interval}
            defaultLabel={t('Select interval…')}
            onChange={v => updateField('interval', v)}
            style={{ width: '100%' }}
          />
        </FormField>
      </View>

      {/* Category */}
      <FormField label={t('Category')}>
        <Select
          options={categoryOptions}
          value={form.category_id}
          defaultLabel={t('No category')}
          onChange={v => updateField('category_id', v)}
          style={{ width: '100%' }}
        />
      </FormField>

      {/* Start + End date in a row */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
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

      {/* Notice period + auto-renewal */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <FormField label={t('Notice period (months)')} style={{ flex: 1 }}>
          <Input
            value={form.notice_period_months}
            onChangeValue={v => updateField('notice_period_months', v)}
            type="number"
            placeholder="1"
            inputMode="numeric"
          />
        </FormField>

        <FormField label={t('Auto-renewal')} style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 4,
            }}
          >
            <Toggle
              id="auto-renewal-toggle"
              isOn={form.auto_renewal}
              onToggle={isOn => updateField('auto_renewal', isOn)}
            />
            <Text style={{ fontSize: 13, color: theme.pageText }}>
              {form.auto_renewal ? t('Enabled') : t('Disabled')}
            </Text>
          </View>
        </FormField>
      </View>

      {/* IBAN + Counterparty */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <FormField label={t('IBAN')} style={{ flex: 1 }}>
          <Input
            value={form.iban}
            onChangeValue={v => updateField('iban', v)}
            placeholder="DE89 3704 0044 …"
          />
        </FormField>

        <FormField label={t('Counterparty')} style={{ flex: 1 }}>
          <Input
            value={form.counterparty}
            onChangeValue={v => updateField('counterparty', v)}
            placeholder={t('Recipient name')}
          />
        </FormField>
      </View>

      {/* Tags */}
      <FormField label={t('Tags')}>
        <TagsInput value={tags} onChange={setTags} />
      </FormField>

      {/* Notes */}
      <FormField label={t('Notes')}>
        <textarea
          value={form.notes}
          onChange={e => updateField('notes', e.target.value)}
          placeholder={t('Additional notes…')}
          rows={3}
          style={{
            width: '100%',
            padding: '6px 10px',
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
      </FormField>

      {/* Action row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 20,
          gap: 10,
        }}
      >
        {/* Destructive actions on the left */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!isNew && onDelete && (
            <Button
              variant="bare"
              onPress={onDelete}
              style={{ color: theme.errorText }}
            >
              <Trans>Delete</Trans>
            </Button>
          )}
          {!isNew && onCancelContract && contract?.status === 'active' && (
            <Button variant="bare" onPress={onCancelContract}>
              <Trans>Cancel contract</Trans>
            </Button>
          )}
        </View>

        {/* Primary actions on the right */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="normal" onPress={() => navigate('/contracts')}>
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
  );
}
