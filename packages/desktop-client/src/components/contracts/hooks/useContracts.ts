// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { ContractEntity, ContractFormData } from '../types';

type UseContractsOptions = {
  status?: string;
  type?: string;
  autoLoad?: boolean;
};

type UseContractsReturn = {
  contracts: ContractEntity[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createContract: (data: ContractFormData) => Promise<ContractEntity | null>;
  updateContract: (
    id: string,
    data: Partial<Omit<ContractEntity, 'id' | 'created_at' | 'updated_at'>>,
  ) => Promise<ContractEntity | null>;
  deleteContract: (id: string) => Promise<boolean>;
  recordPriceChange: (
    id: string,
    oldAmount: number,
    newAmount: number,
    changeDate: string,
    reason?: string,
  ) => Promise<boolean>;
};

export function useContracts({
  status,
  type,
  autoLoad = true,
}: UseContractsOptions = {}): UseContractsReturn {
  const [contracts, setContracts] = useState<ContractEntity[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    const args: Record<string, string> = {};
    if (status) args.status = status;
    if (type) args.type = type;

    const result = await (send as Function)('contract-list', args);

    if (result && 'error' in result) {
      setError(result.error as string);
      setContracts([]);
    } else {
      setContracts((result as ContractEntity[]) ?? []);
    }
    setLoading(false);
  }, [status, type]);

  useEffect(() => {
    if (autoLoad) {
      void reload();
    }
  }, [autoLoad, reload]);

  const createContract = useCallback(
    async (formData: ContractFormData): Promise<ContractEntity | null> => {
      const amountCents = formData.amount
        ? Math.round(parseFloat(formData.amount) * 100)
        : undefined;

      const payload: Record<string, unknown> = {
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
      };

      const result = await (send as Function)('contract-create', payload);
      if (result && 'error' in result) {
        return null;
      }
      return result as ContractEntity;
    },
    [],
  );

  const updateContract = useCallback(
    async (
      id: string,
      data: Partial<Omit<ContractEntity, 'id' | 'created_at' | 'updated_at'>>,
    ): Promise<ContractEntity | null> => {
      const result = await (send as Function)('contract-update', { id, data });
      if (result && 'error' in result) {
        return null;
      }
      return result as ContractEntity;
    },
    [],
  );

  const deleteContract = useCallback(async (id: string): Promise<boolean> => {
    const result = await (send as Function)('contract-delete', { id });
    return result && !('error' in result);
  }, []);

  const recordPriceChange = useCallback(
    async (
      id: string,
      oldAmount: number,
      newAmount: number,
      changeDate: string,
      reason?: string,
    ): Promise<boolean> => {
      const result = await (send as Function)('contract-price-change', {
        id,
        oldAmount,
        newAmount,
        changeDate,
        reason,
      });
      return result && !('error' in result);
    },
    [],
  );

  return {
    contracts,
    loading,
    error,
    reload,
    createContract,
    updateContract,
    deleteContract,
    recordPriceChange,
  };
}
