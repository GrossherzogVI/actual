import type { ForecastEvent, ForecastResult } from './engine.js';

export type ScenarioMutation =
  | { type: 'cancel_contract'; contractId: string }
  | { type: 'modify_amount'; contractId: string; newAmount: number }
  | { type: 'add_event'; date: string; amount: number; description: string }
  | { type: 'delay_invoice'; invoiceId: string; newDate: string };

export type ScenarioDelta = {
  baselineWorstPoint: number;
  scenarioWorstPoint: number;
  totalDelta: number; // total difference in cents over horizon
  monthlyDelta: { month: string; delta: number }[];
};

export function applyMutations(
  events: ForecastEvent[],
  mutations: ScenarioMutation[],
): ForecastEvent[] {
  let result = [...events.map(e => ({ ...e }))];

  for (const mut of mutations) {
    switch (mut.type) {
      case 'cancel_contract':
        result = result.filter(
          e =>
            !(e.sourceType === 'contract' && e.sourceId === mut.contractId),
        );
        break;

      case 'modify_amount':
        for (const e of result) {
          if (e.sourceType === 'contract' && e.sourceId === mut.contractId) {
            e.amount = mut.newAmount;
          }
        }
        break;

      case 'add_event':
        result.push({
          date: mut.date,
          amount: mut.amount,
          description: mut.description,
          sourceType: 'schedule',
          sourceId: `scenario-${Date.now()}`,
        });
        break;

      case 'delay_invoice':
        for (const e of result) {
          if (e.sourceType === 'invoice' && e.sourceId === mut.invoiceId) {
            e.date = mut.newDate;
          }
        }
        break;
    }
  }

  // Re-sort by date after mutations
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

export function compareScenarios(
  baseline: ForecastResult,
  scenario: ForecastResult,
): ScenarioDelta {
  // Build monthly maps for delta computation
  const baseMonthly = new Map(
    baseline.monthlyNetCashflow.map(m => [m.month, m.net]),
  );
  const scenarioMonthly = new Map(
    scenario.monthlyNetCashflow.map(m => [m.month, m.net]),
  );

  // Collect all months from both
  const allMonths = new Set([
    ...baseMonthly.keys(),
    ...scenarioMonthly.keys(),
  ]);

  const monthlyDelta = Array.from(allMonths)
    .sort()
    .map(month => ({
      month,
      delta: (scenarioMonthly.get(month) || 0) - (baseMonthly.get(month) || 0),
    }));

  const totalDelta = monthlyDelta.reduce((sum, m) => sum + m.delta, 0);

  return {
    baselineWorstPoint: baseline.worstPoint.balance,
    scenarioWorstPoint: scenario.worstPoint.balance,
    totalDelta,
    monthlyDelta,
  };
}
