// @ts-strict-ignore
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Optional element rendered in the top-right corner of the card header */
  action?: ReactNode;
};

export function WidgetCard({
  title,
  children,
  style,
  className,
  action,
}: Props) {
  return (
    <Card className={cn('gap-0 py-0 shadow-sm', className)} style={style}>
      <CardHeader className="px-4 pb-2 pt-3">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="px-4 pb-3">{children}</CardContent>
    </Card>
  );
}
