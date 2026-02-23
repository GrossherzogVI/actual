import {
  buildGermanHolidaySet,
  isBusinessDay,
} from '@finance-os/domain-kernel';

import type { GatewayRepository } from '../repositories/types';
import type { TemporalLaneSignal, TemporalSignals } from '../types';

import {
  TEMPORAL_WEEKDAY_FORMATTER,
  addDays,
  dateKey,
  laneSeverity,
  laneReason,
  MS_PER_DAY,
  normalizeBundesland,
  parseLaneDeadline,
  severitySortValue,
  startOfDay,
} from './helpers';

export function createTemporalService(repository: GatewayRepository) {
  async function getTemporalSignals(input?: {
    bundesland?: string;
    horizonDays?: number;
  }): Promise<TemporalSignals> {
    const bundesland = normalizeBundesland(input?.bundesland);
    const horizonDays = Math.max(
      7,
      Math.min(45, Math.trunc(input?.horizonDays ?? 14)),
    );
    const today = startOfDay(new Date());
    const todayMs = today.getTime();

    const holidayCache = new Map<number, Set<string>>();
    const calendar = Array.from({ length: horizonDays }, (_, index) => {
      const date = addDays(today, index);
      const key = dateKey(date);
      const year = date.getFullYear();
      if (!holidayCache.has(year)) {
        holidayCache.set(year, buildGermanHolidaySet(year, bundesland));
      }
      const holidays = holidayCache.get(year)!;
      const holiday = holidays.has(key);
      return {
        date: key,
        weekday: TEMPORAL_WEEKDAY_FORMATTER.format(date),
        isBusinessDay: isBusinessDay(date, holidays),
        isHoliday: holiday,
      };
    });

    const nextBusinessDay = calendar.find(day => day.isBusinessDay)?.date;
    const nextHolidayDate = calendar.find(day => day.isHoliday)?.date;

    const lanes = await repository.listDelegateLanes(500);
    const activeLanes = lanes.filter(
      lane => lane.status === 'assigned' || lane.status === 'accepted',
    );

    const laneSignals = activeLanes
      .map(lane => {
        const deadline = parseLaneDeadline(lane);
        const daysUntilDue =
          typeof deadline.dueAtMs === 'number'
            ? Math.floor((deadline.dueAtMs - todayMs) / MS_PER_DAY)
            : undefined;
        const severity = laneSeverity(lane, daysUntilDue);
        const recommendedChain =
          severity === 'critical'
            ? 'triage -> delegate-triage-batch -> apply-batch-policy'
            : severity === 'warn'
              ? 'triage -> open-review -> delegate-triage-batch'
              : 'triage -> refresh';

        return {
          signal: {
            laneId: lane.id,
            title: lane.title,
            assignee: lane.assignee,
            priority: lane.priority,
            status: lane.status,
            dueAtMs: deadline.dueAtMs,
            deadlineDate: deadline.deadlineDate,
            daysUntilDue,
            severity,
            reason: laneReason(daysUntilDue),
            recommendedChain,
          } satisfies TemporalLaneSignal,
          daysUntilDue: daysUntilDue ?? Number.POSITIVE_INFINITY,
          updatedAtMs: lane.updatedAtMs,
        };
      })
      .sort((left, right) => {
        const severityDiff =
          severitySortValue(left.signal.severity) -
          severitySortValue(right.signal.severity);
        if (severityDiff !== 0) {
          return severityDiff;
        }
        if (left.daysUntilDue !== right.daysUntilDue) {
          return left.daysUntilDue - right.daysUntilDue;
        }
        return right.updatedAtMs - left.updatedAtMs;
      })
      .map(entry => entry.signal);

    const summary = {
      critical: laneSignals.filter(signal => signal.severity === 'critical')
        .length,
      warn: laneSignals.filter(signal => signal.severity === 'warn').length,
      info: laneSignals.filter(signal => signal.severity === 'info').length,
      businessDays: calendar.filter(day => day.isBusinessDay).length,
      holidays: calendar.filter(day => day.isHoliday).length,
    };

    const state = await repository.getOpsState();
    const criticalWeight = summary.critical;
    const warnWeight = summary.warn;
    const urgentWeight = state.urgentReviews;
    const closeSafeAmountDelta = criticalWeight * 180 + warnWeight * 95;
    const closeSafeRiskDelta = -Math.max(1, criticalWeight * 2 + warnWeight);
    const delegateBatchAmountDelta = criticalWeight * 260 + warnWeight * 120;
    const delegateBatchRiskDelta = -Math.max(
      1,
      criticalWeight * 3 + warnWeight,
    );
    const reviewAmountDelta = urgentWeight * 70;
    const reviewRiskDelta = -Math.max(1, urgentWeight);
    const recommendedChains = [
      {
        id: 'temporal-close-safe',
        label: 'Run safe close window',
        chain: 'triage -> close-safe -> refresh',
        reason: nextBusinessDay
          ? `Next business-day execution window starts ${nextBusinessDay}.`
          : 'No business-day window detected in horizon.',
        amountDelta: closeSafeAmountDelta,
        riskDelta: closeSafeRiskDelta,
      },
      {
        id: 'temporal-delegate-batch',
        label: 'Batch delegate deadline triage',
        chain:
          'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
        reason:
          summary.critical + summary.warn > 0
            ? `${summary.critical} critical and ${summary.warn} warning lane(s) need coordinated action.`
            : 'No urgent lane pressure right now.',
        amountDelta: delegateBatchAmountDelta,
        riskDelta: delegateBatchRiskDelta,
      },
      {
        id: 'temporal-review-stabilize',
        label: 'Stabilize review pressure',
        chain: 'triage -> open-review -> refresh',
        reason:
          state.urgentReviews > 0
            ? `${state.urgentReviews} urgent review item(s) can compound deadline risk.`
            : 'Urgent review pressure is currently low.',
        amountDelta: reviewAmountDelta,
        riskDelta: reviewRiskDelta,
      },
    ];

    return {
      generatedAtMs: Date.now(),
      bundesland,
      horizonDays,
      nextBusinessDay,
      nextHolidayDate,
      calendar,
      laneSignals,
      recommendedChains,
      summary,
    };
  }

  return {
    getTemporalSignals,
  };
}
