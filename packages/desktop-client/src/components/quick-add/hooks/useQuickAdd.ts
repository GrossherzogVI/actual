// @ts-strict-ignore
import { useCallback, useState } from 'react';

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

export function useQuickAdd(): UseQuickAddReturn {
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
    if (!form.evaluatedAmount && !form.amount) return false;
    // Log for now — actual submission requires existing Actual transaction handlers
    console.log('[QuickAdd] Submit transaction:', form);
    return true;
  }, [form]);

  return { form, setField, resetForm, prefill, submitTransaction };
}
