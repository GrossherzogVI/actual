/** Workflow state machine types for the Finance OS command loop */

export type WorkflowStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowTransition = {
  from: WorkflowStatus;
  to: WorkflowStatus;
  trigger: string;
  guardFn?: (context: WorkflowContext) => boolean;
};

export type WorkflowContext = {
  workflowId: string;
  actorId: string;
  startedAtMs: number;
  updatedAtMs: number;
  metadata: Record<string, unknown>;
};

export type WorkflowState = {
  workflowId: string;
  status: WorkflowStatus;
  context: WorkflowContext;
  history: WorkflowTransition[];
};

const VALID_TRANSITIONS: WorkflowTransition[] = [
  { from: 'idle', to: 'pending', trigger: 'enqueue' },
  { from: 'pending', to: 'running', trigger: 'start' },
  { from: 'running', to: 'paused', trigger: 'pause' },
  { from: 'paused', to: 'running', trigger: 'resume' },
  { from: 'running', to: 'completed', trigger: 'complete' },
  { from: 'running', to: 'failed', trigger: 'fail' },
  { from: 'failed', to: 'pending', trigger: 'retry' },
  { from: 'pending', to: 'cancelled', trigger: 'cancel' },
  { from: 'running', to: 'cancelled', trigger: 'cancel' },
  { from: 'paused', to: 'cancelled', trigger: 'cancel' },
];

export function canTransition(
  from: WorkflowStatus,
  trigger: string,
  context?: WorkflowContext,
): WorkflowStatus | null {
  const match = VALID_TRANSITIONS.find(
    t => t.from === from && t.trigger === trigger,
  );
  if (!match) return null;
  if (match.guardFn && context && !match.guardFn(context)) return null;
  return match.to;
}

export function isTerminalStatus(status: WorkflowStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
