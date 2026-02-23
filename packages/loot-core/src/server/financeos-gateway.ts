// @ts-strict-ignore
import { fetch } from '../platform/server/fetch';

type GatewayEnvelope = {
  commandId: string;
  actorId: string;
  tenantId: string;
  workspaceId: string;
  intent: string;
  workflowId: string;
  sourceSurface: string;
  confidenceContext: {
    score: number;
    rationale: string;
  };
  latencyBudgetMs: number;
  clientTimestampMs: number;
};

function normalizeBase(url: string) {
  return String(url).replace(/\/+$/, '');
}

function httpError(status: number, payload: string): Error {
  let reason = `http-${status}`;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.reason === 'string') {
        reason = parsed.reason;
      } else if (typeof parsed.error === 'string') {
        reason = parsed.error;
      } else if (typeof parsed.message === 'string') {
        reason = parsed.message;
      }
    }
  } catch {
    reason = payload || reason;
  }
  return new Error(reason);
}

function getGatewayBaseServer() {
  const fromEnv =
    process.env.FINANCE_GATEWAY_URL || process.env.ACTUAL_FINANCE_GATEWAY_URL;
  if (fromEnv) {
    return normalizeBase(fromEnv);
  }

  return 'http://localhost:7070';
}

export function createGatewayEnvelope(intent: string): GatewayEnvelope {
  const now = Date.now();
  return {
    commandId: `cmd-${intent}-${now}`,
    actorId: 'owner',
    tenantId: 'default',
    workspaceId: 'default',
    intent,
    workflowId: 'loot-core-handler',
    sourceSurface: 'desktop-client',
    confidenceContext: {
      score: 0.8,
      rationale: 'handler-bridge',
    },
    latencyBudgetMs: 5_000,
    clientTimestampMs: now,
  };
}

export async function gatewayGet<T>(path: string, token: string): Promise<T> {
  const base = getGatewayBaseServer();
  if (!base) {
    throw new Error('no-server');
  }

  let res: Response;
  let text = '';

  try {
    res = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-ACTUAL-TOKEN': token,
      },
    });
    text = await res.text();
  } catch {
    throw new Error('network-failure');
  }

  if (res.status < 200 || res.status >= 300) {
    throw httpError(res.status, text);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('parse-json');
  }
}

export async function gatewayPost<T>(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  const base = getGatewayBaseServer();
  if (!base) {
    throw new Error('no-server');
  }

  let res: Response;
  let text = '';

  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'X-ACTUAL-TOKEN': token,
      },
    });
    text = await res.text();
  } catch {
    throw new Error('network-failure');
  }

  if (res.status < 200 || res.status >= 300) {
    throw httpError(res.status, text);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('parse-json');
  }
}
