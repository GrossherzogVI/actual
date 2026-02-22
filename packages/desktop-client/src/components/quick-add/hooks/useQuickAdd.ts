// @ts-strict-ignore
import { useCallback, useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

import { send } from 'loot-core/platform/client/connection';

import type { Preset, QuickAddFormData } from '../types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: QuickAddFormData = {
  amount: '',
  evaluatedAmount: null,
  categoryId: '',
  categoryName: '',
  payee: '',
  accountId: '',
  date: todayISO(),
  notes: '',
};

type UseQuickAddReturn = {
  form: QuickAddFormData;
  setField: <K extends keyof QuickAddFormData>(key: K, value: QuickAddFormData[K]) => void;
  resetForm: () => void;
  prefill: (preset: Preset) => void;
  submitTransaction: () => Promise<boolean>;
};

export function useQuickAdd(defaultAccountId?: string): UseQuickAddReturn {
  const [form, setForm] = useState<QuickAddFormData>({ ...EMPTY_FORM, date: todayISO() });

  const setField = useCallback(
    <K extends keyof QuickAddFormData>(key: K, value: QuickAddFormData[K]) => {
      setForm(prev => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_FORM, date: todayISO() });
  }, []);

  const prefill = useCallback((preset: Preset) => {
    setForm(prev => ({
      ...prev,
      amount: preset.amount != null ? String(preset.amount / 100) : '',
      evaluatedAmount: preset.amount ?? null,
      categoryId: preset.categoryId ?? '',
      payee: preset.payee ?? '',
      accountId: preset.accountId ?? '',
    }));
  }, []);

  const submitTransaction = useCallback(async (): Promise<boolean> => {
    const amount = form.evaluatedAmount;
    if (amount == null) return false;

    const accountId = form.accountId || defaultAccountId;
    if (!accountId) return false;

    // Resolve payee name to ID (find existing or create new)
    let payeeId: string | undefined;
    if (form.payee.trim()) {
      try {
        const payees = await send('payees-get');
        const match = payees.find(
          (p) => p.name.toLowerCase() === form.payee.trim().toLowerCase(),
        );
        if (match) {
          payeeId = match.id;
        } else {
          payeeId = await send('payee-create', {
            name: form.payee.trim(),
          });
        }
      } catch {
        // payee resolution failed — proceed without payee
      }
    }

    const transaction = {
      id: uuidv4(),
      date: form.date,
      amount: -Math.abs(amount), // negative = expense
      account: accountId,
      category: form.categoryId || undefined,
      payee: payeeId || undefined,
      notes: form.notes || undefined,
    };

    await send('transaction-add', transaction);
    return true;
  }, [form, defaultAccountId]);

  return { form, setField, resetForm, prefill, submitTransaction };
}
