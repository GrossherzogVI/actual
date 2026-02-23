import React from 'react';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgPin } from '@actual-app/components/icons/v1';
import {
  SvgArrowButtonLeft1,
  SvgArrowButtonRight1,
} from '@actual-app/components/icons/v2';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useSidebar } from '@/components/ui/sidebar';

type ToggleButtonProps = {
  style?: CSSProperties;
};

export function ToggleButton({ style }: ToggleButtonProps) {
  const { t } = useTranslation();
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';

  return (
    <View className="float" style={{ ...style, flexShrink: 0 }}>
      <Button
        variant="bare"
        aria-label={isExpanded ? t('Collapse sidebar') : t('Expand sidebar')}
        onPress={toggleSidebar}
        style={{ color: theme.buttonMenuBorder }}
      >
        {isExpanded ? (
          <SvgArrowButtonLeft1 style={{ width: 13, height: 13 }} />
        ) : (
          <SvgArrowButtonRight1 style={{ width: 13, height: 13 }} />
        )}
      </Button>
    </View>
  );
}
