import type { FeatureFlag } from 'loot-core/types/prefs';

import { useSyncedPref } from './useSyncedPref';

const DEFAULT_FEATURE_FLAG_STATE: Record<FeatureFlag, boolean> = {
  goalTemplatesEnabled: false,
  goalTemplatesUIEnabled: false,
  actionTemplating: false,
  formulaMode: false,
  currency: false,
  crossoverReport: false,
  customThemes: false,
  budgetAnalysisReport: false,
  contractManagement: true,
  financeOS: true,
  aiSmartMatching: false,
  reviewQueue: false,
  quickAdd: true,
  paymentCalendar: true,
  germanCategories: false,
  extendedCommandBar: true,
};

export function useFeatureFlag(name: FeatureFlag): boolean {
  const [value] = useSyncedPref(`flags.${name}`);

  return value === undefined
    ? DEFAULT_FEATURE_FLAG_STATE[name] || false
    : String(value) === 'true';
}
