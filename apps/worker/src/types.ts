import type Surreal from 'surrealdb';

export type WorkerConfig = {
  workerId: string;
  surrealUrl: string;
  surrealNs: string;
  surrealDb: string;
  surrealUser: string;
  surrealPass: string;
  ollamaUrl: string;
  projectionIntervalMs: number;
  anomalyIntervalMs: number;
  closeRoutineIntervalMs: number;
  queuePollIntervalMs: number;
  queueMaxJobs: number;
  queueMaxAttempts: number;
};

export type JobHandler = (
  db: Surreal,
  config: WorkerConfig,
  payload: Record<string, unknown>,
) => Promise<void>;

/** One row from a parsed CSV bank statement. */
export type ParsedRow = {
  date: string;       // YYYY-MM-DD
  amount: number;     // positive = income, negative = expense (in EUR)
  payee: string;
  notes: string;
  iban?: string;      // counterparty IBAN if known
  reference?: string; // payment reference / Verwendungszweck
};
