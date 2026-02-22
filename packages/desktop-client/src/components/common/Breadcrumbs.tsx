// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

type BreadcrumbSegment = {
  label: string;
  path: string;
};

// Maps route path segments to human-readable labels.
// Add entries here when new pages are introduced.
const SEGMENT_LABELS: Record<string, string> = {
  '': 'Dashboard',
  'dashboard': 'Dashboard',
  'accounts': 'Accounts',
  'budget': 'Budget',
  'reports': 'Reports',
  'schedules': 'Schedules',
  'payees': 'Payees',
  'rules': 'Rules',
  'settings': 'Settings',
  'contracts': 'Contracts',
  'documents': 'Documents',
  'forecast': 'Forecast',
  'ai-review': 'AI Review',
  'import': 'Import',
  'calendar': 'Calendar',
  'tags': 'Tags',
};

function labelForSegment(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment;
}

type BreadcrumbsProps = {
  // Optional override: provide explicit segments instead of deriving from URL.
  // Useful when the last segment has a dynamic label (e.g. contract name).
  overrides?: Array<{ label: string; path: string }>;
  style?: React.CSSProperties;
};

export function Breadcrumbs({ overrides, style }: BreadcrumbsProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const segments: BreadcrumbSegment[] = React.useMemo(() => {
    if (overrides) return overrides;

    // Split path into parts, build cumulative paths
    const parts = location.pathname.split('/').filter(Boolean);

    const crumbs: BreadcrumbSegment[] = [
      { label: t('Dashboard'), path: '/dashboard' },
    ];

    let cumulative = '';
    for (const part of parts) {
      cumulative += `/${part}`;
      const label = labelForSegment(part);
      // Skip if it would duplicate the leading Dashboard crumb
      if (cumulative === '/dashboard') continue;
      crumbs.push({ label: t(label), path: cumulative });
    }

    return crumbs;
  }, [location.pathname, overrides, t]);

  // Don't render on the dashboard itself (only one crumb)
  if (segments.length <= 1) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 12,
        ...style,
      }}
    >
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        return (
          <View key={seg.path} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {idx > 0 && (
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued, userSelect: 'none' }}>
                ›
              </Text>
            )}
            {isLast ? (
              <Text style={{ fontSize: 12, color: theme.pageText, fontWeight: 500 }}>
                {seg.label}
              </Text>
            ) : (
              <Button
                variant="bare"
                onPress={() => navigate(seg.path)}
                style={{
                  fontSize: 12,
                  color: theme.pageTextLink ?? theme.pageTextSubdued,
                  padding: '1px 2px',
                }}
              >
                {seg.label}
              </Button>
            )}
          </View>
        );
      })}
    </View>
  );
}
