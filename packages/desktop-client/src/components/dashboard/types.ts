// @ts-strict-ignore
import type { ContractEntity, ContractSummary } from 'loot-core/server/contracts/app';

export type { ContractEntity, ContractSummary };

export type ReviewCounts = {
  pending: number;
  urgent: number;
  review: number;
  suggestion: number;
};

export type UpcomingPayment = {
  date: string; // YYYY-MM-DD
  contractId: string;
  name: string;
  amount: number | null; // cents
  interval: string;
};

export type DashboardData = {
  contractSummary: ContractSummary | null;
  reviewCounts: ReviewCounts | null;
  expiringContracts: ContractEntity[];
  loading: boolean;
  error: string | null;
};
