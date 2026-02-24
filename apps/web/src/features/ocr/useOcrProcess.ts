import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createReceipt,
  deleteReceipt,
  enqueueOcrJob,
  findMatchCandidates,
  getReceipt,
  linkReceiptToTransaction,
  listReceipts,
  updateReceipt,
} from './ocr-api';
import type { Receipt, ReceiptItem } from './types';

export function useReceipts(opts?: { status?: string }) {
  return useQuery({
    queryKey: ['receipts', opts?.status],
    queryFn: () => listReceipts({ status: opts?.status }),
    refetchInterval: (query) => {
      const receipts = query.state.data as Receipt[] | undefined;
      const hasActive = receipts?.some(
        r => r.status === 'pending' || r.status === 'processing',
      );
      return hasActive ? 5000 : false;
    },
  });
}

export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: ['receipt', id],
    queryFn: () => (id ? getReceipt(id) : null),
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll while processing
      const receipt = query.state.data as Receipt | null | undefined;
      if (receipt?.status === 'pending' || receipt?.status === 'processing') {
        return 2000;
      }
      return false;
    },
  });
}

export function useUploadReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { base64: string; fileName: string; fileType: string }) => {
      const receipt = await createReceipt({
        image_data: data.base64,
        file_name: data.fileName,
        file_type: data.fileType,
      });
      await enqueueOcrJob(String(receipt.id));
      return receipt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
}

export function useUpdateReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      extracted_amount?: number;
      extracted_date?: string;
      extracted_vendor?: string;
      extracted_items?: ReceiptItem[];
    }) => {
      const { id, ...fields } = data;
      return updateReceipt(id, fields);
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['receipt', receipt.id] });
    },
  });
}

export function useLinkReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { receiptId: string; transactionId: string }) => {
      return linkReceiptToTransaction(data.receiptId, data.transactionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
}

export function useDeleteReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
}

export function useMatchCandidates(amount: number | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['receipt-matches', amount, date],
    queryFn: () => {
      if (amount == null) return [];
      return findMatchCandidates(Math.abs(amount), date);
    },
    enabled: amount != null,
  });
}
