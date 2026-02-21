// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

import type {
  ForecastResult,
  DailyBalance,
  ForecastEvent,
} from './types';

export type { ForecastResult, DailyBalance, ForecastEvent };

export type ScenarioMutation =
  | { type: 'cancel_contract'; contractId: string }
  | { type: 'modify_amount'; contractId: string; newAmount: number }
  | { type: 'add_event'; date: string; amount: number; description: string }
  | { type: 'delay_invoice'; invoiceId: string; newDate: string };

export type ScenarioDelta = {
  baselineWorstPoint: number;
  scenarioWorstPoint: number;
  totalDelta: number;
  monthlyDelta: { month: string; delta: number }[];
};

export type ScenarioResponse = {
  baseline: ForecastResult;
  scenario: ForecastResult;
  delta: ScenarioDelta;
};

export type ForecastHandlers = {
  'forecast-baseline': typeof getBaseline;
  'forecast-scenario': typeof runScenario;
};

export const app = createApp<ForecastHandlers>();

app.method('forecast-baseline', getBaseline);
app.method('forecast-scenario', runScenario);

async function getBaseline(args: {
  fileId: string;
  horizon?: number;
  startingBalance?: number;
}): Promise<ForecastResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const { fileId, horizon = 180, startingBalance = 0 } = args;
  try {
    const res = await get(
      getServer().BASE_SERVER +
        `/forecast/baseline?fileId=${encodeURIComponent(fileId)}&horizon=${horizon}&startingBalance=${startingBalance}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function runScenario(args: {
  fileId: string;
  horizon?: number;
  startingBalance?: number;
  mutations: ScenarioMutation[];
}): Promise<ScenarioResponse | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const { fileId, horizon = 180, startingBalance = 0, mutations } = args;
  try {
    const result = await post(
      getServer().BASE_SERVER + '/forecast/scenario',
      { fileId, horizon, startingBalance, mutations },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ScenarioResponse;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
