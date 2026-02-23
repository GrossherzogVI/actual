export type CommandStepId =
  | 'resolve-next-action'
  | 'run-close-weekly'
  | 'run-close-monthly'
  | 'run-close-safe'
  | 'create-default-playbook'
  | 'run-first-playbook'
  | 'open-expiring-contracts'
  | 'assign-expiring-contracts-lane'
  | 'delegate-triage-batch'
  | 'escalate-stale-lanes'
  | 'apply-batch-policy'
  | 'open-urgent-review'
  | 'refresh-command-center';

export type CommandParseStep = {
  id: CommandStepId;
  index: number;
  raw: string;
  canonical: string;
};

export type CommandParseError = {
  code: 'empty-command' | 'unknown-token';
  index: number;
  raw: string;
};

export type CommandParseResult = {
  steps: CommandParseStep[];
  errors: CommandParseError[];
};

export type CommandMeshHint = {
  command: string;
  description: string;
};

const COMMAND_CANONICAL: Record<CommandStepId, string> = {
  'resolve-next-action': 'resolve-next',
  'run-close-weekly': 'close-weekly',
  'run-close-monthly': 'close-monthly',
  'run-close-safe': 'close-safe',
  'create-default-playbook': 'playbook-create-default',
  'run-first-playbook': 'playbook-run-first',
  'open-expiring-contracts': 'expiring<30d',
  'assign-expiring-contracts-lane': 'batch-renegotiate',
  'delegate-triage-batch': 'delegate-triage-batch',
  'escalate-stale-lanes': 'escalate-stale-lanes',
  'apply-batch-policy': 'apply-batch-policy',
  'open-urgent-review': 'open-review',
  'refresh-command-center': 'refresh',
};

const SINGLE_ALIASES: Record<string, CommandStepId> = {
  triage: 'resolve-next-action',
  'resolve-next': 'resolve-next-action',
  'close-weekly': 'run-close-weekly',
  close: 'run-close-weekly',
  weekly: 'run-close-weekly',
  'close-monthly': 'run-close-monthly',
  monthly: 'run-close-monthly',
  'close-safe': 'run-close-safe',
  'safe-close': 'run-close-safe',
  'run-close-safe': 'run-close-safe',
  'playbook-create-default': 'create-default-playbook',
  playbook: 'create-default-playbook',
  'run-first': 'run-first-playbook',
  'playbook-run-first': 'run-first-playbook',
  'expiring<30d': 'open-expiring-contracts',
  'batch-renegotiate': 'assign-expiring-contracts-lane',
  'delegate-expiring': 'assign-expiring-contracts-lane',
  'delegate-triage-batch': 'delegate-triage-batch',
  'delegate-batch': 'delegate-triage-batch',
  'escalate-stale-lanes': 'escalate-stale-lanes',
  'escalate-stale': 'escalate-stale-lanes',
  'stale-lanes': 'escalate-stale-lanes',
  'apply-batch-policy': 'apply-batch-policy',
  'batch-policy': 'apply-batch-policy',
  'open-review': 'open-urgent-review',
  refresh: 'refresh-command-center',
};

const PAIR_ALIASES: Record<string, CommandStepId> = {
  'triage->resolve-next': 'resolve-next-action',
  'close->weekly': 'run-close-weekly',
  'close->monthly': 'run-close-monthly',
  'close->safe': 'run-close-safe',
  'playbook->create-default': 'create-default-playbook',
  'playbook->run-first': 'run-first-playbook',
};

export const COMMAND_MESH_HINTS: CommandMeshHint[] = [
  {
    command: 'triage -> resolve-next',
    description: 'Load next high-impact action and open the target surface.',
  },
  {
    command: 'close -> weekly',
    description: 'Run weekly close routine and refresh pressure metrics.',
  },
  {
    command: 'playbook -> create-default -> run-first',
    description: 'Create baseline playbook and execute the first dry-run.',
  },
  {
    command: 'expiring<30d -> batch-renegotiate',
    description: 'Open expiring contracts and assign renegotiation lane.',
  },
  {
    command:
      'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
    description:
      'Escalate stale lanes, delegate triage batch, and apply policy in one chain.',
  },
];

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

function tokenize(chain: string): string[] {
  return chain
    .split('->')
    .map(token => token.trim())
    .filter(Boolean);
}

export function parseCommandChain(chain: string): CommandParseResult {
  const tokens = tokenize(chain);

  if (tokens.length === 0) {
    return {
      steps: [],
      errors: [
        {
          code: 'empty-command',
          index: -1,
          raw: '',
        },
      ],
    };
  }

  const steps: CommandParseStep[] = [];
  const errors: CommandParseError[] = [];

  let index = 0;
  while (index < tokens.length) {
    const current = tokens[index]!;
    const currentNormalized = normalizeToken(current);
    const next = tokens[index + 1];

    if (next) {
      const pairKey = `${currentNormalized}->${normalizeToken(next)}`;
      const pairId = PAIR_ALIASES[pairKey];
      if (pairId) {
        steps.push({
          id: pairId,
          index,
          raw: `${current} -> ${next}`,
          canonical: COMMAND_CANONICAL[pairId],
        });
        index += 2;
        continue;
      }
    }

    const singleId = SINGLE_ALIASES[currentNormalized];
    if (singleId) {
      steps.push({
        id: singleId,
        index,
        raw: current,
        canonical: COMMAND_CANONICAL[singleId],
      });
    } else {
      errors.push({
        code: 'unknown-token',
        index,
        raw: currentNormalized,
      });
    }

    index += 1;
  }

  return { steps, errors };
}
