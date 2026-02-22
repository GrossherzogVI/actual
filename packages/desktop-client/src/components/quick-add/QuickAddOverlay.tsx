// @ts-strict-ignore
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useQuery } from '@tanstack/react-query';
import { send } from 'loot-core/platform/client/connection';

import { accountQueries } from '@desktop-client/accounts';

import { AmountInput } from './AmountInput';
import { CategorySelect } from './CategorySelect';
import { ExpenseTrainMode } from './ExpenseTrainMode';
import { PresetBar } from './PresetBar';
import { RecentTemplates } from './RecentTemplates';
import { useCalculator } from './hooks/useCalculator';
import { useFrecency } from './hooks/useFrecency';
import { usePresets } from './hooks/usePresets';
import { useQuickAdd } from './hooks/useQuickAdd';
import type { Category } from './types';

type QuickAddOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function QuickAddOverlay({ isOpen, onClose }: QuickAddOverlayProps) {
  const { t } = useTranslation();

  // Default account: first on-budget account
  const { data: onBudgetAccounts = [] } = useQuery(accountQueries.listOnBudget());
  const defaultAccountId = onBudgetAccounts[0]?.id;

  const { form, setField, resetForm, prefill, submitTransaction } = useQuickAdd(defaultAccountId);
  const { evaluate } = useCalculator();
  const { presets } = usePresets();
  const { frecency } = useFrecency();

  const [categories, setCategories] = useState<Category[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [trainMode, setTrainMode] = useState(false);
  const [trainCount, setTrainCount] = useState(0);
  const [trainTotal, setTrainTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Load categories once on mount
  useEffect(() => {
    void (send as Function)('get-categories', {}).then((result: unknown) => {
      if (result && Array.isArray((result as { list?: unknown[] }).list)) {
        const raw = (result as { list: { id: string; name: string; group_id: string }[] }).list;
        setCategories(
          raw.map(c => ({ id: c.id, name: c.name, group_id: c.group_id })),
        );
      }
    }).catch(() => {
      // Category loading failed — user can still submit without category
    });
  }, []);

  // Re-evaluate amount whenever raw input changes
  useEffect(() => {
    const cents = evaluate(form.amount);
    setField('evaluatedAmount', cents);
  }, [form.amount, evaluate, setField]);

  // Escape closes overlay
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const ok = await submitTransaction();
    if (ok) {
      const amount = form.evaluatedAmount ?? 0;
      if (trainMode) {
        setTrainCount(c => c + 1);
        setTrainTotal(prev => prev + amount);
        resetForm();
      } else {
        resetForm();
        onClose();
      }
    }
    setSubmitting(false);
  }, [submitting, submitTransaction, form.evaluatedAmount, trainMode, resetForm, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!isOpen) return null;

  const canSubmit = form.evaluatedAmount != null;

  return (
    <View
      ref={backdropRef}
      onMouseDown={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 3001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Dialog */}
      <View
        onKeyDown={handleKeyDown}
        style={{
          width: 480,
          backgroundColor: theme.modalBackground,
          border: `1px solid ${theme.modalBorder}`,
          borderRadius: 12,
          boxShadow: '0 16px 70px rgba(0,0,0,.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 8px',
            borderBottom: `1px solid ${theme.tableBorderSeparator}`,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
            <Trans>Quick Add</Trans>
          </Text>
          <Button variant="bare" onPress={onClose} style={{ padding: '2px 6px', fontSize: 16 }}>
            ×
          </Button>
        </View>

        {/* Preset bar */}
        <PresetBar presets={presets} onSelect={prefill} />

        {/* Amount (auto-focused) */}
        <AmountInput
          value={form.amount}
          onChange={v => setField('amount', v)}
          evaluatedAmount={form.evaluatedAmount}
          autoFocus
        />

        {/* Category + Payee row */}
        <View style={{ flexDirection: 'row', gap: 8, padding: '0 16px 10px' }}>
          <CategorySelect
            value={form.categoryName}
            onChange={(id, name) => {
              setField('categoryId', id);
              setField('categoryName', name);
            }}
            categories={categories}
            frecency={frecency}
          />
          <Input
            value={form.payee}
            onChange={e => setField('payee', e.target.value)}
            placeholder={t('Payee…')}
            style={{
              flex: 1,
              fontSize: 14,
              padding: '8px 12px',
              border: `1px solid ${theme.formInputBorder}`,
              borderRadius: 6,
              backgroundColor: theme.formInputBackground,
              color: theme.formInputText,
            }}
          />
        </View>

        {/* More fields (collapsible) */}
        <View style={{ padding: '0 16px 6px' }}>
          <Button
            variant="bare"
            onPress={() => setShowMore(v => !v)}
            style={{ fontSize: 12, color: theme.pageTextSubdued, alignSelf: 'flex-start' }}
          >
            {showMore ? t('▴ Less') : t('▾ More')}
          </Button>
          {showMore && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                style={{
                  flex: 1,
                  fontSize: 13,
                  padding: '7px 10px',
                  border: `1px solid ${theme.formInputBorder}`,
                  borderRadius: 6,
                  backgroundColor: theme.formInputBackground,
                  color: theme.formInputText,
                }}
              />
              <Input
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder={t('Notes…')}
                style={{
                  flex: 2,
                  fontSize: 13,
                  padding: '7px 10px',
                  border: `1px solid ${theme.formInputBorder}`,
                  borderRadius: 6,
                  backgroundColor: theme.formInputBackground,
                  color: theme.formInputText,
                }}
              />
            </View>
          )}
        </View>

        {/* Recent templates */}
        <RecentTemplates templates={[]} onSelect={tpl => {
          setField('payee', tpl.payee);
          setField('amount', String(tpl.amount / 100));
          setField('categoryId', tpl.categoryId);
          setField('categoryName', tpl.categoryName);
          setField('accountId', tpl.accountId);
        }} />

        {/* Train mode bar */}
        <ExpenseTrainMode
          enabled={trainMode}
          onToggle={() => setTrainMode(v => !v)}
          entryCount={trainCount}
          runningTotal={trainTotal}
        />

        {/* Footer — submit */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 16px',
            borderTop: `1px solid ${theme.tableBorderSeparator}`,
          }}
        >
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued, flex: 1 }}>
            <Trans>⌘↵ to submit</Trans>
          </Text>
          <Button variant="bare" onPress={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="primary"
            onPress={handleSubmit}
            isDisabled={!canSubmit || submitting}
          >
            {trainMode ? <Trans>Add &amp; next</Trans> : <Trans>Add</Trans>}
          </Button>
        </View>
      </View>
    </View>
  );
}
