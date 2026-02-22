import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { BUNDESLAND_LABELS } from 'loot-core/shared/german-holidays';
import type { Bundesland } from 'loot-core/shared/german-holidays';

import type { FeatureFlag, ServerPrefs } from 'loot-core/types/prefs';

import { Setting } from './UI';

import { useAuth } from '@desktop-client/auth/AuthProvider';
import { Permissions } from '@desktop-client/auth/types';
import { Link } from '@desktop-client/components/common/Link';
import { Checkbox } from '@desktop-client/components/forms';
import {
  useLoginMethod,
  useMultiuserEnabled,
} from '@desktop-client/components/ServerContext';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useServerPref } from '@desktop-client/hooks/useServerPref';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';

type FeatureToggleProps = {
  flag: FeatureFlag;
  disableToggle?: boolean;
  error?: ReactNode;
  children: ReactNode;
  feedbackLink?: string;
};

function FeatureToggle({
  flag: flagName,
  disableToggle = false,
  feedbackLink,
  error,
  children,
}: FeatureToggleProps) {
  const enabled = useFeatureFlag(flagName);
  const [_, setFlagPref] = useSyncedPref(`flags.${flagName}`);

  return (
    <label style={{ display: 'flex' }}>
      <Checkbox
        checked={enabled}
        onChange={() => {
          setFlagPref(String(!enabled));
        }}
        disabled={disableToggle}
      />
      <View
        style={{ color: disableToggle ? theme.pageTextSubdued : 'inherit' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {children}
          {feedbackLink && (
            <Link variant="external" to={feedbackLink}>
              <Trans>(give feedback)</Trans>
            </Link>
          )}
        </View>

        {disableToggle && (
          <Text
            style={{
              color: theme.errorText,
              fontWeight: 500,
            }}
          >
            {error}
          </Text>
        )}
      </View>
    </label>
  );
}

type ServerFeatureToggleProps = {
  prefName: keyof ServerPrefs;
  disableToggle?: boolean;
  error?: ReactNode;
  children: ReactNode;
  feedbackLink?: string;
};

function ServerFeatureToggle({
  prefName,
  disableToggle = false,
  feedbackLink,
  error,
  children,
}: ServerFeatureToggleProps) {
  const [enabled, setEnabled] = useServerPref(prefName);

  const syncServerStatus = useSyncServerStatus();
  const isUsingServer = syncServerStatus !== 'no-server';
  const isServerOffline = syncServerStatus === 'offline';
  const { hasPermission } = useAuth();
  const loginMethod = useLoginMethod();
  const multiuserEnabled = useMultiuserEnabled();

  if (!isUsingServer || isServerOffline) {
    return null;
  }

  // Show to admins if OIDC is enabled, or to everyone if multi-user is not enabled
  const isAdmin = hasPermission(Permissions.ADMINISTRATOR);
  const oidcEnabled = loginMethod === 'openid';
  const shouldShow = (oidcEnabled && isAdmin) || !multiuserEnabled;

  if (!shouldShow) {
    return null;
  }

  return (
    <label style={{ display: 'flex' }}>
      <Checkbox
        checked={enabled === 'true'}
        onChange={() => {
          setEnabled(enabled === 'true' ? 'false' : 'true');
        }}
        disabled={disableToggle}
      />
      <View
        style={{ color: disableToggle ? theme.pageTextSubdued : 'inherit' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {children}
          {feedbackLink && (
            <Link variant="external" to={feedbackLink}>
              <Trans>(give feedback)</Trans>
            </Link>
          )}
        </View>

        {disableToggle && (
          <Text
            style={{
              color: theme.errorText,
              fontWeight: 500,
            }}
          >
            {error}
          </Text>
        )}
      </View>
    </label>
  );
}

const BUNDESLAND_SELECT_OPTIONS: [string, string][] = [
  ['', 'Nur Bundesfeiertage'],
  ...(Object.entries(BUNDESLAND_LABELS) as [Bundesland, string][]).map(
    ([k, v]) => [k, v] as [string, string],
  ),
];

function DeadlineSettings() {
  const { t } = useTranslation();
  const [bundesland, setBundesland] = useSyncedPref('deadlineBundesland');
  const [showHard, setShowHard] = useSyncedPref('deadlineShowHard');

  return (
    <View
      style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: `1px solid ${theme.tableBorder}`,
        gap: 12,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.pageTextSubdued,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <Trans>Zahlungsfristen</Trans>
      </Text>

      {/* Bundesland selector */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13 }}>
          <Trans>Bundesland (Feiertage)</Trans>
        </Text>
        <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
          <Trans>
            Bestimmt welche Feiertage bei der Berechnung von Werktagen berücksichtigt werden.
          </Trans>
        </Text>
        <select
          value={bundesland ?? ''}
          onChange={e => setBundesland(e.target.value || undefined)}
          style={{
            marginTop: 4,
            padding: '6px 10px',
            borderRadius: 4,
            border: `1px solid ${theme.tableBorder}`,
            backgroundColor: theme.tableBackground,
            color: theme.pageText,
            fontSize: 13,
            fontFamily: 'inherit',
            maxWidth: 320,
          }}
        >
          {BUNDESLAND_SELECT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </View>

      {/* Show hard deadlines toggle */}
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showHard === 'true'}
          onChange={e => setShowHard(e.target.checked ? 'true' : 'false')}
          style={{ marginTop: 3 }}
        />
        <View>
          <Text style={{ fontSize: 13 }}>
            <Trans>Harte Fristen anzeigen</Trans>
          </Text>
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            <Trans>
              Zeigt das letzte Datum vor Konsequenzen zusätzlich zum Fälligkeitsdatum an.
            </Trans>
          </Text>
        </View>
      </label>
    </View>
  );
}

export function ExperimentalFeatures() {
  const [expanded, setExpanded] = useState(false);

  const goalTemplatesEnabled = useFeatureFlag('goalTemplatesEnabled');
  const goalTemplatesUIEnabled = useFeatureFlag('goalTemplatesUIEnabled');
  const showGoalTemplatesUI =
    goalTemplatesUIEnabled ||
    (goalTemplatesEnabled &&
      localStorage.getItem('devEnableGoalTemplatesUI') === 'true');

  const showServerPrefs =
    localStorage.getItem('devEnableServerPrefs') === 'true';

  return (
    <Setting
      primaryAction={
        expanded ? (
          <View style={{ gap: '1em' }}>
            <FeatureToggle flag="goalTemplatesEnabled">
              <Trans>Goal templates</Trans>
            </FeatureToggle>
            {showGoalTemplatesUI && (
              <View style={{ paddingLeft: 22 }}>
                <FeatureToggle flag="goalTemplatesUIEnabled">
                  <Trans>Subfeature: Budget automations UI</Trans>
                </FeatureToggle>
              </View>
            )}
            <FeatureToggle
              flag="actionTemplating"
              feedbackLink="https://github.com/actualbudget/actual/issues/3606"
            >
              <Trans>Rule action templating</Trans>
            </FeatureToggle>
            <FeatureToggle
              flag="formulaMode"
              feedbackLink="https://github.com/actualbudget/actual/issues/5949"
            >
              <Trans>Excel formula mode (Formula cards & Rule formulas)</Trans>
            </FeatureToggle>
            <FeatureToggle
              flag="currency"
              feedbackLink="https://github.com/actualbudget/actual/issues/5191"
            >
              <Trans>Currency support</Trans>
            </FeatureToggle>

            <FeatureToggle
              flag="crossoverReport"
              feedbackLink="https://github.com/actualbudget/actual/issues/6134"
            >
              <Trans>Crossover Report</Trans>
            </FeatureToggle>
            <FeatureToggle
              flag="customThemes"
              feedbackLink="https://github.com/actualbudget/actual/issues/6607"
            >
              <Trans>Custom themes</Trans>
            </FeatureToggle>
            <FeatureToggle
              flag="budgetAnalysisReport"
              feedbackLink="https://github.com/actualbudget/actual/pull/6742"
            >
              <Trans>Budget Analysis Report</Trans>
            </FeatureToggle>
            <FeatureToggle flag="financeOS">
              <Trans>Finance OS (Dashboard, Navigation)</Trans>
            </FeatureToggle>
            <FeatureToggle flag="contractManagement">
              <Trans>Contract Management</Trans>
            </FeatureToggle>
            <FeatureToggle flag="aiSmartMatching">
              <Trans>AI Smart Matching</Trans>
            </FeatureToggle>
            <FeatureToggle flag="reviewQueue">
              <Trans>Review Queue</Trans>
            </FeatureToggle>
            <FeatureToggle flag="quickAdd">
              <Trans>Quick Add (⌘N)</Trans>
            </FeatureToggle>
            <FeatureToggle flag="paymentCalendar">
              <Trans>Payment Calendar</Trans>
            </FeatureToggle>
            <FeatureToggle flag="germanCategories">
              <Trans>German Category Tree</Trans>
            </FeatureToggle>
            <FeatureToggle flag="extendedCommandBar">
              <Trans>Extended Command Bar</Trans>
            </FeatureToggle>
            {showServerPrefs && (
              <ServerFeatureToggle
                prefName="flags.plugins"
                disableToggle
                feedbackLink="https://github.com/actualbudget/actual/issues/5950"
              >
                <Trans>Client-Side plugins (soon)</Trans>
              </ServerFeatureToggle>
            )}

            <DeadlineSettings />
          </View>
        ) : (
          <Link
            variant="text"
            onClick={() => setExpanded(true)}
            data-testid="experimental-settings"
            style={{
              flexShrink: 0,
              alignSelf: 'flex-start',
              color: theme.pageTextPositive,
            }}
          >
            <Trans>I understand the risks, show experimental features</Trans>
          </Link>
        )
      }
    >
      <Text>
        <Trans>
          <strong>Experimental features.</strong> These features are not fully
          tested and may not work as expected. THEY MAY CAUSE IRRECOVERABLE DATA
          LOSS. They may do nothing at all. Only enable them if you know what
          you are doing.
        </Trans>
      </Text>
    </Setting>
  );
}
