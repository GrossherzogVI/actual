export type RuntimeCommand =
  | 'open-incidents'
  | 'stabilize'
  | 'requeue-expired'
  | 'replay-dead-letters'
  | 'start-pipeline';

export type RuntimeCommandEventDetail = {
  command: RuntimeCommand;
  source: 'palette' | 'timeline' | 'runtime-panel' | 'shell';
};

export const RUNTIME_COMMAND_EVENT = 'financeos.runtime.command';

export function dispatchRuntimeCommand(
  detail: RuntimeCommandEventDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<RuntimeCommandEventDetail>(RUNTIME_COMMAND_EVENT, {
      detail,
    }),
  );
}
