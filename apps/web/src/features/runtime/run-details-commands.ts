export type RunDetailsScope = 'command' | 'playbook';

export type RunDetailsSelector =
  | 'latest-live'
  | 'latest-failed'
  | 'latest-blocked'
  | 'latest-rollback-eligible';

export type RunDetailsCommandEventDetail = {
  scope: RunDetailsScope;
  selector?: RunDetailsSelector;
  runId?: string;
  source: 'palette' | 'shell' | 'provenance';
};

export const RUN_DETAILS_COMMAND_EVENT = 'financeos.run-details.command';

export function dispatchRunDetailsCommand(
  detail: RunDetailsCommandEventDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<RunDetailsCommandEventDetail>(RUN_DETAILS_COMMAND_EVENT, {
      detail,
    }),
  );
}
