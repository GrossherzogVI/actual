// @ts-strict-ignore
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogTrigger } from 'react-aria-components';

import { Button } from '@actual-app/components/button';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { Tooltip } from '@actual-app/components/tooltip';
import {
  SvgTag,
  SvgDotsHorizontalTriple,
  SvgCheckmark,
  SvgRefresh,
  SvgLightBulb,
  SvgPause,
  SvgTime,
  SvgClose,
  SvgStarFull,
} from '@actual-app/components/icons/v1';
import { SvgAlertTriangle } from '@actual-app/components/icons/v2';

import {
  PRIORITY_BORDER_COLORS,
  getItemTitle,
  getItemSubtitle,
  type ReviewItem as ReviewItemType,
  type ReviewItemType as ItemType,
} from './types';

// ---- Icon by type ----

type TypeIconProps = {
  type: ItemType;
  size?: number;
};

function TypeIcon({ type, size = 14 }: TypeIconProps) {
  const style = { width: size, height: size, color: 'inherit', flexShrink: 0 };
  switch (type) {
    case 'uncategorized':
      return <SvgTag style={style} />;
    case 'low_confidence':
      return <SvgStarFull style={style} />;
    case 'recurring_detected':
      return <SvgRefresh style={style} />;
    case 'amount_mismatch':
      return <SvgAlertTriangle style={style} />;
    case 'budget_suggestion':
      return <SvgLightBulb style={style} />;
    case 'parked_expense':
      return <SvgPause style={style} />;
    default:
      return <SvgTag style={style} />;
  }
}

// ---- Confidence bar ----

type ConfidenceBarProps = {
  confidence: number; // 0.0 – 1.0
};

function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.9 ? '#10b981' : confidence >= 0.7 ? '#f59e0b' : '#ef4444';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
      }}
    >
      <View
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: `${color}30`,
          maxWidth: 120,
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      </View>
      <Text style={{ fontSize: 11, color, fontWeight: 500 }}>{pct}%</Text>
    </View>
  );
}

// ---- ReviewItem ----

type ReviewItemProps = {
  item: ReviewItemType;
  isProcessing: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSnooze: (id: string) => void;
  onDismiss: (id: string) => void;
};

export function ReviewItem({
  item,
  isProcessing,
  onAccept,
  onReject,
  onSnooze,
  onDismiss,
}: ReviewItemProps) {
  const { t } = useTranslation();

  const handleAccept = useCallback(() => onAccept(item.id), [onAccept, item.id]);
  const handleReject = useCallback(() => onReject(item.id), [onReject, item.id]);
  const handleSnooze = useCallback(() => onSnooze(item.id), [onSnooze, item.id]);
  const handleDismiss = useCallback(() => onDismiss(item.id), [onDismiss, item.id]);

  const title = getItemTitle(item);
  const subtitle = getItemSubtitle(item);
  const borderColor = PRIORITY_BORDER_COLORS[item.priority];

  const iconBgColor =
    item.priority === 'urgent'
      ? '#ef444415'
      : item.priority === 'review'
        ? '#f59e0b15'
        : '#3b82f615';
  const iconColor =
    item.priority === 'urgent'
      ? '#ef4444'
      : item.priority === 'review'
        ? '#f59e0b'
        : '#3b82f6';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: '12px 15px',
        borderBottom: `1px solid ${theme.tableBorder}`,
        borderLeft: `3px solid ${borderColor}`,
        backgroundColor: theme.tableBackground,
        opacity: isProcessing ? 0.5 : 1,
        transition: 'opacity 0.15s',
        gap: 12,
      }}
    >
      {/* Type icon */}
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: iconBgColor,
          color: iconColor,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <TypeIcon type={item.type} size={14} />
      </View>

      {/* Main content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: theme.pageText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Text>

        {subtitle && (
          <Text
            style={{
              fontSize: 12,
              color: theme.pageTextSubdued,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        )}

        {item.ai_confidence != null && (
          <ConfidenceBar confidence={item.ai_confidence} />
        )}

        {item.transaction_amount != null && (
          <Text
            style={{
              fontSize: 12,
              color: theme.pageTextSubdued,
              marginTop: 3,
            }}
          >
            {t('Amount')}: {(item.transaction_amount / 100).toFixed(2)}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Tooltip content={t('Accept')} placement="top">
          <Button
            variant="bare"
            onPress={handleAccept}
            isDisabled={isProcessing}
            style={{
              padding: '5px 7px',
              color: '#10b981',
              borderRadius: 4,
            }}
          >
            <SvgCheckmark style={{ width: 13, height: 13 }} />
          </Button>
        </Tooltip>

        <Tooltip content={t('Reject')} placement="top">
          <Button
            variant="bare"
            onPress={handleReject}
            isDisabled={isProcessing}
            style={{
              padding: '5px 7px',
              color: '#ef4444',
              borderRadius: 4,
            }}
          >
            <SvgClose style={{ width: 13, height: 13 }} />
          </Button>
        </Tooltip>

        <Tooltip content={t('Snooze 7 days')} placement="top">
          <Button
            variant="bare"
            onPress={handleSnooze}
            isDisabled={isProcessing}
            style={{
              padding: '5px 7px',
              color: theme.pageTextSubdued,
              borderRadius: 4,
            }}
          >
            <SvgTime style={{ width: 13, height: 13 }} />
          </Button>
        </Tooltip>

        <DialogTrigger>
          <Button
            variant="bare"
            isDisabled={isProcessing}
            style={{
              padding: '5px 7px',
              color: theme.pageTextSubdued,
              borderRadius: 4,
            }}
          >
            <SvgDotsHorizontalTriple style={{ width: 13, height: 13 }} />
          </Button>
          <Popover placement="bottom end">
            <Menu
              onMenuSelect={name => {
                if (name === 'dismiss') handleDismiss();
              }}
              items={[
                { name: 'dismiss', text: t('Dismiss permanently') },
              ]}
            />
          </Popover>
        </DialogTrigger>
      </View>
    </View>
  );
}
