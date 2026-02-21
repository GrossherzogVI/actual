// @ts-strict-ignore
import { useState } from 'react';

// Placeholder hook — real implementation requires schedule + account data integration.
// Returns static shape so consumers compile correctly.

export type ProjectionPoint = {
  date: string; // YYYY-MM-DD
  balance: number; // cents
};

export function useBalanceProjection(): {
  points: ProjectionPoint[];
  loading: boolean;
  error: string | null;
} {
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  return { points: [], loading, error };
}
