import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import {
  SvgCheckmark,
  SvgCheveronDown,
  SvgCheveronRight,
  SvgCog,
  SvgCreditCard,
  SvgReports,
  SvgStoreFront,
  SvgTag,
  SvgTuning,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar3 } from '@actual-app/components/icons/v2';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Item } from './Item';
import { SecondaryItem } from './SecondaryItem';

import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useIsTestEnv } from '@desktop-client/hooks/useIsTestEnv';
import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const onToggle = useCallback(() => setOpen(open => !open), []);
  const location = useLocation();

  const syncServerStatus = useSyncServerStatus();
  const isTestEnv = useIsTestEnv();
  const isUsingServer = syncServerStatus !== 'no-server' || isTestEnv;
  const financeOS = useFeatureFlag('financeOS');

  // Progressive disclosure: track whether contracts/review data exists
  const [hasContracts, setHasContracts] = useState(false);
  const [hasReviewItems, setHasReviewItems] = useState(false);

  useEffect(() => {
    if (!financeOS) return;
    void (async () => {
      try {
        const [contractsResult, reviewResult] = await Promise.all([
          (send as Function)('contract-list', {}),
          (send as Function)('review-count'),
        ]);
        if (Array.isArray(contractsResult) && contractsResult.length > 0) {
          setHasContracts(true);
        }
        if (reviewResult && typeof reviewResult === 'object' && !('error' in reviewResult)) {
          const total = Object.values(reviewResult as Record<string, number>).reduce(
            (s, v) => s + (typeof v === 'number' ? v : 0),
            0,
          );
          setHasReviewItems(total > 0);
        }
      } catch {
        // Silently ignore — items stay dimmed
      }
    })();
  }, [financeOS]);

  // Routes that trigger the More menu to auto-open in default mode
  const defaultMoreRoutes = [
    '/payees',
    '/rules',
    '/bank-sync',
    '/settings',
    '/tools',
    '/contracts',
  ];

  // Routes that trigger the More menu to auto-open in financeOS mode
  // (contracts is promoted to top bar, import/review added)
  const financeOSMoreRoutes = [
    '/payees',
    '/rules',
    '/bank-sync',
    '/settings',
    '/tools',
    '/import',
    '/review',
    '/schedules',
    '/tags',
  ];

  const moreRoutes = financeOS ? financeOSMoreRoutes : defaultMoreRoutes;

  const isActive = moreRoutes.some(route =>
    location.pathname.startsWith(route),
  );

  useEffect(() => {
    if (isActive) {
      setOpen(true);
    }
  }, [isActive, location.pathname]);

  if (financeOS) {
    return (
      <View style={{ flexShrink: 0 }}>
        <Item title={t('Dashboard')} Icon={SvgWallet} to="/dashboard" />
        <Item title={t('Accounts')} Icon={SvgCreditCard} to="/accounts" />
        <Item title={t('Budget')} Icon={SvgWallet} to="/budget" />
        <Item title={t('Reports')} Icon={SvgReports} to="/reports" />
        {/* Contracts — dimmed until data exists */}
        <View
          style={{ opacity: hasContracts ? 1 : 0.4, pointerEvents: hasContracts ? 'auto' : 'none' }}
          title={hasContracts ? undefined : t('Import data to unlock')}
        >
          <Item title={t('Contracts')} Icon={SvgCreditCard} to="/contracts" />
        </View>
        {/* Calendar — dimmed until contracts exist */}
        <View
          style={{ opacity: hasContracts ? 1 : 0.4, pointerEvents: hasContracts ? 'auto' : 'none' }}
          title={hasContracts ? undefined : t('Import data to unlock')}
        >
          <Item title={t('Calendar')} Icon={SvgCalendar3} to="/calendar" />
        </View>
        <Item
          title={t('More')}
          Icon={isOpen ? SvgCheveronDown : SvgCheveronRight}
          onClick={onToggle}
          style={{ marginBottom: isOpen ? 8 : 0 }}
          forceActive={!isOpen && isActive}
        />
        {isOpen && (
          <>
            <SecondaryItem
              title={t('Import')}
              Icon={SvgCreditCard}
              to="/import"
              indent={15}
            />
            {/* Review — dimmed until AI populates it */}
            <View
              style={{
                opacity: hasReviewItems ? 1 : 0.4,
                pointerEvents: hasReviewItems ? 'auto' : 'none',
              }}
              title={hasReviewItems ? undefined : t('AI will populate this')}
            >
              <SecondaryItem
                title={t('Review')}
                Icon={SvgCheckmark}
                to="/review"
                indent={15}
              />
            </View>
            <SecondaryItem
              title={t('Settings')}
              Icon={SvgCog}
              to="/settings"
              indent={15}
            />
            <SecondaryItem
              title={t('Payees')}
              Icon={SvgStoreFront}
              to="/payees"
              indent={15}
            />
            <SecondaryItem
              title={t('Rules')}
              Icon={SvgTuning}
              to="/rules"
              indent={15}
            />
            {isUsingServer && (
              <SecondaryItem
                title={t('Bank Sync')}
                Icon={SvgCreditCard}
                to="/bank-sync"
                indent={15}
              />
            )}
            <SecondaryItem
              title={t('Tags')}
              Icon={SvgTag}
              to="/tags"
              indent={15}
            />
            <SecondaryItem
              title={t('Schedules')}
              Icon={SvgCalendar3}
              to="/schedules"
              indent={15}
            />
          </>
        )}
      </View>
    );
  }

  // Default layout — unchanged
  return (
    <View style={{ flexShrink: 0 }}>
      <Item title={t('Budget')} Icon={SvgWallet} to="/budget" />
      <Item title={t('Reports')} Icon={SvgReports} to="/reports" />
      <Item title={t('Schedules')} Icon={SvgCalendar3} to="/schedules" />
      <Item
        title={t('More')}
        Icon={isOpen ? SvgCheveronDown : SvgCheveronRight}
        onClick={onToggle}
        style={{ marginBottom: isOpen ? 8 : 0 }}
        forceActive={!isOpen && isActive}
      />
      {isOpen && (
        <>
          <SecondaryItem
            title={t('Payees')}
            Icon={SvgStoreFront}
            to="/payees"
            indent={15}
          />
          <SecondaryItem
            title={t('Rules')}
            Icon={SvgTuning}
            to="/rules"
            indent={15}
          />
          {isUsingServer && (
            <SecondaryItem
              title={t('Bank Sync')}
              Icon={SvgCreditCard}
              to="/bank-sync"
              indent={15}
            />
          )}
          <SecondaryItem
            title={t('Tags')}
            Icon={SvgTag}
            to="/tags"
            indent={15}
          />
          <SecondaryItem
            title={t('Contracts')}
            Icon={SvgCreditCard}
            to="/contracts"
            indent={15}
          />
          <SecondaryItem
            title={t('Settings')}
            Icon={SvgCog}
            to="/settings"
            indent={15}
          />
        </>
      )}
    </View>
  );
}
