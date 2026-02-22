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
import { useToast } from '../common/Toast';
import type { Category, RecentTemplate } from './types';

type QuickAddOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

function formatEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    Math.abs(cents) / 100,
  );
}

export function QuickAddOverlay({ isOpen, onClose }: QuickAddOverlayProps) {
  const { t } = useTranslation();
  const toast = useToast();

  // Default account: first on-budget account
  const { data: onBudgetAccounts = [] } = useQuery(accountQueries.listOnBudget());
  const defaultAccountId = onBudgetAccounts[0]?.id;

  const {
    form,
    isIncome,
    setIsIncome,
    setField,
    resetForm,
    resetAmountOnly,
    prefill,
    submitTransaction,
  } = useQuickAdd(defaultAccountId);

  const { evaluate } = useCalculator();
  const { presets } = usePresets();
  const { frecency } = useFrecency();

  const [categories, setCategories] = useState<Category[]>([]);
  const [recentTemplates, setRecentTemplates] = useState<RecentTemplate[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [trainMode, setTrainMode] = useState(false);
  const [trainCount, setTrainCount] = useState(0);
  const [trainTotal, setTrainTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [parkFeedback, setParkFeedback] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
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

  // Load 5 most recent transactions for Recent Templates (6.6)
  useEffect(() => {
    if (!isOpen) return;
    void (send as Function)('transactions-get', {
      accountId: null,
      options: { limit: 5, sort: [{ field: 'date', order: 'desc' }] },
    }).then((result: unknown) => {
      const list = Array.isArray(result)
        ? result
        : Array.isArray((result as any)?.transactions)
          ? (result as any).transactions
          : [];
      const templates: RecentTemplate[] = list.slice(0, 5).map((tx: any) => ({
        payee: tx.payee_name ?? tx.payee ?? '',
        amount: Math.abs(tx.amount ?? 0),
        categoryId: tx.category ?? '',
        categoryName: tx.category_name ?? '',
        accountId: tx.account ?? '',
        date: tx.date ?? new Date().toISOString().slice(0, 10),
      }));
      setRecentTemplates(templates);
    }).catch(() => {
      // Recent templates unavailable — graceful degradation
    });
  }, [isOpen]);

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

  const focusAmount = useCallback(() => {
    // Small timeout so React can flush state updates first
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('[data-quick-add-amount]');
      el?.focus();
      el?.select();
    }, 30);
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  // Save and close (default submit)
  const handleSubmitAndClose = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const txId = await submitTransaction();
    if (txId) {
      const amount = form.evaluatedAmount ?? 0;
      if (trainMode) {
        setTrainCount(c => c + 1);
        setTrainTotal(prev => prev + amount);
        resetForm();
        focusAmount();
      } else {
        toast.show(t('Saved: {{amount}}', { amount: formatEur(amount) }), {
          type: 'success',
          duration: 10000,
          action: {
            label: t('Undo'),
            onPress: () => {
              void send('transaction-delete', { id: txId });
            },
          },
        });
        resetForm();
        onClose();
      }
    }
    setSubmitting(false);
  }, [submitting, submitTransaction, form.evaluatedAmount, trainMode, resetForm, onClose, toast, t, focusAmount]);

  // 6.1: Save + New — reset form, keep overlay open, focus amount
  const handleSubmitAndNew = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const txId = await submitTransaction();
    if (txId) {
      const amount = form.evaluatedAmount ?? 0;
      toast.show(t('Saved: {{amount}}', { amount: formatEur(amount) }), {
        type: 'success',
        duration: 10000,
        action: {
          label: t('Undo'),
          onPress: () => {
            void send('transaction-delete', { id: txId });
          },
        },
      });
      resetForm();
      focusAmount();
    }
    setSubmitting(false);
  }, [submitting, submitTransaction, form.evaluatedAmount, resetForm, toast, t, focusAmount]);

  // 6.2: Save + Duplicate — reset amount only, keep category/payee/account
  const handleSubmitAndDuplicate = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const txId = await submitTransaction();
    if (txId) {
      const amount = form.evaluatedAmount ?? 0;
      toast.show(t('Saved: {{amount}}', { amount: formatEur(amount) }), {
        type: 'success',
        duration: 10000,
        action: {
          label: t('Undo'),
          onPress: () => {
            void send('transaction-delete', { id: txId });
          },
        },
      });
      resetAmountOnly();
      focusAmount();
    }
    setSubmitting(false);
  }, [submitting, submitTransaction, form.evaluatedAmount, resetAmountOnly, toast, t, focusAmount]);

  // 6.3: Park for Later — save as draft to review queue
  const handlePark = useCallback(async () => {
    if (submitting || form.evaluatedAmount == null) return;
    setSubmitting(true);
    try {
      await (send as Function)('review-create', {
        type: 'parked_expense',
        priority: 'review',
        amount: form.evaluatedAmount,
        category_id: form.categoryId || undefined,
        notes: 'Parked from Quick Add',
      });
      setParkFeedback(true);
      setTimeout(() => setParkFeedback(false), 2000);
      resetForm();
      focusAmount();
    } catch {
      // Park failed silently
    }
    setSubmitting(false);
  }, [submitting, form.evaluatedAmount, form.categoryId, resetForm, focusAmount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // 6.3: Cmd+P — Park for later
      if (meta && e.key === 'p') {
        e.preventDefault();
        void handlePark();
        return;
      }

      if (e.key === 'Enter' && meta) {
        e.preventDefault();
        if (e.shiftKey) {
          // 6.2: Cmd+Shift+Enter — Save + Duplicate
          void handleSubmitAndDuplicate();
        } else {
          // 6.1: Cmd+Enter — Save + New (keep overlay open)
          void handleSubmitAndNew();
        }
      }
    },
    [handlePark, handleSubmitAndNew, handleSubmitAndDuplicate],
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

        {/* Amount row with +/- income toggle (6.5) */}
        <View style={{ position: 'relative' }}>
          {/* Income/Expense toggle */}
          <Button
            variant="bare"
            onPress={() => setIsIncome(v => !v)}
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1,
              fontSize: 18,
              fontWeight: 700,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `2px solid ${isIncome ? '#10b981' : theme.formInputBorder}`,
              color: isIncome ? '#10b981' : theme.pageTextSubdued,
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            aria-label={isIncome ? t('Switch to expense') : t('Switch to income')}
          >
            {isIncome ? '+' : '−'}
          </Button>

          {/* Amount input — left-padded to make room for toggle */}
          <View style={{ paddingLeft: 56 }}>
            <AmountInput
              value={form.amount}
              onChange={v => setField('amount', v)}
              evaluatedAmount={form.evaluatedAmount}
              autoFocus
              isIncome={isIncome}
              data-quick-add-amount
            />
          </View>
        </View>

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

        {/* Recent templates (6.6) */}
        <RecentTemplates templates={recentTemplates} onSelect={tpl => {
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
          {/* Keyboard shortcut hints */}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
              <Trans>⌘↵ new · ⌘⇧↵ dup · ⌘P park</Trans>
            </Text>
          </View>

          {/* 6.3: Park for later button */}
          <Button
            variant="bare"
            onPress={handlePark}
            isDisabled={!canSubmit || submitting}
            style={{
              fontSize: 12,
              color: parkFeedback ? '#10b981' : theme.pageTextSubdued,
              padding: '4px 8px',
            }}
          >
            {parkFeedback ? <Trans>Parked!</Trans> : <Trans>Park</Trans>}
          </Button>

          <Button variant="bare" onPress={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="primary"
            onPress={handleSubmitAndClose}
            isDisabled={!canSubmit || submitting}
          >
            {trainMode ? <Trans>Add &amp; next</Trans> : <Trans>Add</Trans>}
          </Button>
        </View>
      </View>
    </View>
  );
}
