import type { ScheduleEntity } from 'loot-core/types/models';

/** Resolve a display name for a schedule: prefer schedule.name, fall back to payee name. */
export function getScheduleName(
  schedule: ScheduleEntity,
  payeesById: Map<string, { name: string }>,
): string {
  if (schedule.name) return schedule.name;
  const payee = payeesById.get(schedule._payee);
  if (payee) return payee.name;
  return 'Scheduled payment';
}

/** Derive a human-readable interval label from a schedule's _date config. */
export function getScheduleInterval(schedule: ScheduleEntity): string {
  const dateConfig = schedule._date;
  if (typeof dateConfig === 'object' && dateConfig !== null) {
    return dateConfig.frequency ?? 'unknown';
  }
  return 'once';
}
