import React, { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Trans, useTranslation } from 'react-i18next';
import { Route, Routes, useLocation } from 'react-router';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgArrowLeft } from '@actual-app/components/icons/v1';
import {
  SvgAlertTriangle,
  SvgViewHide,
  SvgViewShow,
} from '@actual-app/components/icons/v2';
import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { listen } from 'loot-core/platform/client/connection';
import { isDevelopmentEnvironment } from 'loot-core/shared/environment';

import { AccountSyncCheck } from './accounts/AccountSyncCheck';
import { AnimatedRefresh } from './AnimatedRefresh';
import { MonthCountSelector } from './budget/MonthCountSelector';
import { Link } from './common/Link';
import { HelpMenu } from './HelpMenu';
import { LoggedInUser } from './LoggedInUser';
import { useServerURL } from './ServerContext';
import { ThemeSelector } from './ThemeSelector';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';
import { Separator } from './ui/separator';
import { SidebarTrigger, useSidebar } from './ui/sidebar';

import { sync } from '@desktop-client/app/appSlice';
import { useGlobalPref } from '@desktop-client/hooks/useGlobalPref';
import { useIsTestEnv } from '@desktop-client/hooks/useIsTestEnv';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { useDispatch } from '@desktop-client/redux';
import * as bindings from '@desktop-client/spreadsheet/bindings';

function PageBreadcrumbs() {
  const location = useLocation();
  const paths = location.pathname.split('/').filter(Boolean);

  if (paths.length === 0) return null;

  // We only want to show the first two levels to avoid overly long breadcrumbs
  // e.g., /accounts/my-bank-id -> Accounts > my-bank-id
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {paths.slice(0, 2).map((path, index) => {
          const isLast = index === paths.slice(0, 2).length - 1;
          const href = `/${paths.slice(0, index + 1).join('/')}`;
          const title = path.replace(/-/g, ' ');

          return (
            <React.Fragment key={path}>
              <BreadcrumbItem className="hidden md:block">
                {isLast ? (
                  <BreadcrumbPage className="capitalize">
                    {title}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href} className="capitalize">
                    {title}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className="hidden md:block" />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function UncategorizedButton() {
  const count: number | null = useSheetValue(bindings.uncategorizedCount());
  if (count === null || count <= 0) {
    return null;
  }

  return (
    <Link
      variant="button"
      buttonVariant="bare"
      to="/categories/uncategorized"
      style={{
        color: theme.errorText,
      }}
    >
      <Trans count={count}>{{ count }} uncategorized transactions</Trans>
    </Link>
  );
}

type PrivacyButtonProps = {
  style?: CSSProperties;
};

function PrivacyButton({ style }: PrivacyButtonProps) {
  const { t } = useTranslation();
  const [isPrivacyEnabledPref, setPrivacyEnabledPref] =
    useSyncedPref('isPrivacyEnabled');
  const isPrivacyEnabled = String(isPrivacyEnabledPref) === 'true';

  const privacyIconStyle = { width: 15, height: 15 };

  useHotkeys(
    'shift+ctrl+p, shift+cmd+p, shift+meta+p',
    () => {
      setPrivacyEnabledPref(String(!isPrivacyEnabled));
    },
    {
      preventDefault: true,
      scopes: ['app'],
    },
    [setPrivacyEnabledPref, isPrivacyEnabled],
  );

  return (
    <Button
      variant="bare"
      aria-label={
        isPrivacyEnabled ? t('Disable privacy mode') : t('Enable privacy mode')
      }
      onPress={() => setPrivacyEnabledPref(String(!isPrivacyEnabled))}
      style={style}
    >
      {isPrivacyEnabled ? (
        <SvgViewHide style={privacyIconStyle} />
      ) : (
        <SvgViewShow style={privacyIconStyle} />
      )}
    </Button>
  );
}

type SyncButtonProps = {
  style?: CSSProperties;
  isMobile?: boolean;
};
function SyncButton({ style, isMobile = false }: SyncButtonProps) {
  const { t } = useTranslation();
  const [cloudFileId] = useMetadataPref('cloudFileId');
  const dispatch = useDispatch();
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<
    null | 'offline' | 'local' | 'disabled' | 'error'
  >(null);

  useEffect(() => {
    const unlisten = listen('sync-event', event => {
      if (event.type === 'start') {
        setSyncing(true);
        setSyncState(null);
      } else {
        // Give the layout some time to apply the starting animation
        // so we always finish it correctly even if it's almost
        // instant
        setTimeout(() => {
          setSyncing(false);
        }, 200);
      }

      if (event.type === 'error') {
        // Use the offline state if either there is a network error or
        // if this file isn't a "cloud file". You can't sync a local
        // file.
        if (event.subtype === 'network') {
          setSyncState('offline');
        } else if (!cloudFileId) {
          setSyncState('local');
        } else {
          setSyncState('error');
        }
      } else if (event.type === 'success') {
        setSyncState(event.syncDisabled ? 'disabled' : null);
      }
    });

    return unlisten;
  }, [cloudFileId]);

  const mobileColor =
    syncState === 'error'
      ? theme.errorText
      : syncState === 'disabled' ||
          syncState === 'offline' ||
          syncState === 'local'
        ? theme.mobileHeaderTextSubdued
        : theme.mobileHeaderText;
  const desktopColor =
    syncState === 'error'
      ? theme.errorTextDark
      : syncState === 'disabled' ||
          syncState === 'offline' ||
          syncState === 'local'
        ? theme.tableTextLight
        : 'inherit';

  const activeStyle = isMobile
    ? {
        color: mobileColor,
      }
    : {};

  const hoveredStyle = isMobile
    ? {
        color: mobileColor,
        background: theme.mobileHeaderTextHover,
      }
    : {};

  const mobileIconStyle = {
    color: mobileColor,
    justifyContent: 'center',
    margin: 10,
    paddingLeft: 5,
    paddingRight: 3,
  };

  const mobileTextStyle = {
    ...styles.text,
    fontWeight: 500,
    marginLeft: 2,
    marginRight: 5,
  };

  const onSync = () => dispatch(sync());

  useHotkeys(
    'ctrl+s, cmd+s, meta+s',
    onSync,
    {
      enableOnFormTags: true,
      preventDefault: true,
      scopes: ['app'],
    },
    [onSync],
  );

  return (
    <Button
      variant="bare"
      aria-label={t('Sync')}
      style={
        {
          ...(isMobile
            ? {
                ...style,
                WebkitAppRegion: 'none',
                ...mobileIconStyle,
              }
            : {
                ...style,
                WebkitAppRegion: 'none',
                color: desktopColor,
              }),
        } as React.CSSProperties
      }
      onPress={onSync}
    >
      {isMobile ? (
        syncState === 'error' ? (
          <SvgAlertTriangle width={14} height={14} />
        ) : (
          <AnimatedRefresh width={18} height={18} animating={syncing} />
        )
      ) : syncState === 'error' ? (
        <SvgAlertTriangle width={13} />
      ) : (
        <AnimatedRefresh animating={syncing} />
      )}
      <Text style={isMobile ? { ...mobileTextStyle } : { marginLeft: 3 }}>
        {syncState === 'disabled'
          ? t('Disabled')
          : syncState === 'offline'
            ? t('Offline')
            : t('Sync')}
      </Text>
    </Button>
  );
}

function BudgetTitlebar() {
  const [maxMonths, setMaxMonthsPref] = useGlobalPref('maxMonths');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <MonthCountSelector
        maxMonths={maxMonths || 1}
        onChange={value => setMaxMonthsPref(value)}
      />
    </View>
  );
}

type TitlebarProps = {
  style?: CSSProperties;
};

export function Titlebar({ style }: TitlebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, state } = useSidebar();
  const { isNarrowWidth } = useResponsive();
  const serverURL = useServerURL();
  const [floatingSidebar] = useGlobalPref('floatingSidebar');
  const isTestEnv = useIsTestEnv();

  return isNarrowWidth ? null : (
    <header
      className="flex h-12 shrink-0 items-center justify-between px-4 border-b border-border bg-background"
      style={
        {
          pointerEvents: 'none',
          WebkitAppRegion: 'drag',
          ...style,
        } as React.CSSProperties
      }
    >
      <div
        className="flex items-center gap-2"
        style={
          {
            pointerEvents: 'auto',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties
        }
      >
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <PageBreadcrumbs />

        <Routes>
          <Route
            path="*"
            element={
              location.state?.goBack ? (
                <Button variant="bare" onPress={() => navigate(-1)}>
                  <SvgArrowLeft
                    width={10}
                    height={10}
                    style={{ marginRight: 5, color: 'currentColor' }}
                  />{' '}
                  <Trans>Back</Trans>
                </Button>
              ) : null
            }
          />

          <Route path="/accounts/:id" element={<AccountSyncCheck />} />
          <Route path="/budget" element={<BudgetTitlebar />} />
        </Routes>
      </div>

      <div
        className="flex items-center gap-2"
        style={
          {
            pointerEvents: 'auto',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties
        }
      >
        <UncategorizedButton />
        {isDevelopmentEnvironment() && !isTestEnv && <ThemeSelector />}
        <PrivacyButton />
        {serverURL ? <SyncButton /> : null}
        <LoggedInUser />
        <HelpMenu />
      </div>
    </header>
  );
}
