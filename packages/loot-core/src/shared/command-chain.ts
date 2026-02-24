/**
 * Command Chain Engine — parse and execute multi-step command chains.
 *
 * Syntax: "command1 arg1 -> command2 arg2 -> command3"
 * Each step separated by "->" is a distinct command.
 *
 * Built-in commands:
 * - close weekly|monthly       Trigger close routine
 * - tag <name>                 Tag selected items
 * - accept [all|high-confidence] Accept review items
 * - reject                     Reject review items
 * - snooze <days>              Snooze review items
 * - classify                   Run AI classification
 * - focus                      Show adaptive focus
 */

export type CommandStep = {
  id: string;
  raw: string;
  canonical: string;
  command: string;
  args: string[];
};

export type StepResult = {
  id: string;
  raw: string;
  canonical: string;
  status: 'ok' | 'error' | 'skipped';
  detail: string;
  route?: string;
};

export type ChainResult = {
  steps: StepResult[];
  success: boolean;
  errorCount: number;
};

const COMMANDS = new Set([
  'close',
  'tag',
  'accept',
  'reject',
  'snooze',
  'classify',
  'focus',
  'navigate',
  'refresh',
]);

/**
 * Parse a command chain string into individual steps.
 */
export function parseChain(chain: string): CommandStep[] {
  const rawSteps = chain
    .split('->')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return rawSteps.map((raw, i) => {
    const parts = raw.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return {
      id: `step-${i}`,
      raw,
      canonical: `${command}${args.length > 0 ? ' ' + args.join(' ') : ''}`,
      command,
      args,
    };
  });
}

/**
 * Validate a chain without executing it (dry run).
 * Returns validation results for each step.
 */
export function validateChain(chain: string): ChainResult {
  const steps = parseChain(chain);

  const results: StepResult[] = steps.map(step => {
    if (!COMMANDS.has(step.command)) {
      return {
        id: step.id,
        raw: step.raw,
        canonical: step.canonical,
        status: 'error' as const,
        detail: `Unknown command: ${step.command}. Available: ${Array.from(COMMANDS).join(', ')}`,
      };
    }

    // Command-specific validation
    switch (step.command) {
      case 'close':
        if (!step.args[0] || !['weekly', 'monthly'].includes(step.args[0])) {
          return {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'error' as const,
            detail: 'close requires "weekly" or "monthly" argument',
          };
        }
        break;

      case 'snooze': {
        const days = parseInt(step.args[0] ?? '', 10);
        if (isNaN(days) || days < 1) {
          return {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'error' as const,
            detail: 'snooze requires a positive number of days',
          };
        }
        break;
      }

      case 'tag':
        if (!step.args[0]) {
          return {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'error' as const,
            detail: 'tag requires a tag name',
          };
        }
        break;

      case 'navigate':
        if (!step.args[0]) {
          return {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'error' as const,
            detail: 'navigate requires a route path',
          };
        }
        break;
    }

    return {
      id: step.id,
      raw: step.raw,
      canonical: step.canonical,
      status: 'ok' as const,
      detail: `Valid: ${step.command}`,
      route: step.command === 'navigate' ? step.args[0] : undefined,
    };
  });

  return {
    steps: results,
    success: results.every(r => r.status !== 'error'),
    errorCount: results.filter(r => r.status === 'error').length,
  };
}

/**
 * Map a command step to the handler name and arguments used by send().
 * Returns { handler, args } for execution via the handler bridge.
 */
export function resolveStepHandler(
  step: CommandStep,
): { handler: string; args: Record<string, unknown> } | null {
  switch (step.command) {
    case 'close':
      return {
        handler: 'workflow-run-close-routine',
        args: { period: step.args[0] },
      };

    case 'accept':
      return {
        handler: 'review-batch',
        args: {
          status: 'accepted',
          filter: step.args[0] ?? 'all',
        },
      };

    case 'reject':
      return {
        handler: 'review-batch',
        args: { status: 'rejected' },
      };

    case 'snooze':
      return {
        handler: 'review-batch',
        args: {
          status: 'snoozed',
          days: parseInt(step.args[0], 10),
        },
      };

    case 'classify':
      return {
        handler: 'ai-classify-batch',
        args: {},
      };

    case 'focus':
      return {
        handler: 'focus-adaptive-panel',
        args: {},
      };

    case 'refresh':
      return {
        handler: 'workflow-money-pulse',
        args: {},
      };

    default:
      return null;
  }
}
