export type WorkflowLoop =
  | 'morning'
  | 'capture'
  | 'triage'
  | 'execution'
  | 'close'
  | 'simulation';

export const WORKFLOW_LOOPS: WorkflowLoop[] = [
  'morning',
  'capture',
  'triage',
  'execution',
  'close',
  'simulation',
];

export function getLoopDisplayName(loop: WorkflowLoop): string {
  switch (loop) {
    case 'morning':
      return 'Morning Loop';
    case 'capture':
      return 'Capture Loop';
    case 'triage':
      return 'Triage Loop';
    case 'execution':
      return 'Execution Loop';
    case 'close':
      return 'Close Loop';
    case 'simulation':
      return 'Simulation Loop';
    default:
      return loop;
  }
}

export function isWorkflowLoop(value: string): value is WorkflowLoop {
  return (WORKFLOW_LOOPS as string[]).includes(value);
}

export function resolveLoopFromSurface(sourceSurface: string): WorkflowLoop {
  const normalized = sourceSurface.toLowerCase();
  if (normalized.includes('quick') || normalized.includes('capture')) {
    return 'capture';
  }
  if (normalized.includes('review') || normalized.includes('triage')) {
    return 'triage';
  }
  if (normalized.includes('calendar') || normalized.includes('contract')) {
    return 'execution';
  }
  if (normalized.includes('close')) {
    return 'close';
  }
  if (normalized.includes('scenario') || normalized.includes('twin')) {
    return 'simulation';
  }
  return 'morning';
}
