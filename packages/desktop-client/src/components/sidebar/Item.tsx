import React from 'react';
import type { ComponentType, SVGProps, ReactNode, CSSProperties } from 'react';
import { useLocation } from 'react-router';

import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Link } from '@desktop-client/components/common/Link';
import { Button } from '@/components/ui/button';

type ItemProps = {
  title: string;
  Icon:
  | ComponentType<SVGProps<SVGElement>>
  | ComponentType<SVGProps<SVGSVGElement>>;
  to?: string;
  children?: ReactNode;
  style?: CSSProperties;
  indent?: number;
  onClick?: () => void;
  forceHover?: boolean;
  forceActive?: boolean;
};

export function Item({
  children,
  Icon,
  title,
  to,
  onClick,
  indent = 0,
  forceActive = false,
}: ItemProps) {
  const location = useLocation();
  const isActive = forceActive || (to ? location.pathname.startsWith(to) : false);

  const content = (
    <>
      <Icon className="w-4 h-4" />
      <span>{title}</span>
    </>
  );

  return (
    <SidebarMenuItem style={{ paddingLeft: indent }}>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        onClick={onClick}
        tooltip={title}
      >
        {to ? (
          <Link variant="internal" to={to} style={{ textDecoration: 'none' }}>
            {content}
          </Link>
        ) : (
          <button onClick={onClick}>
            {content}
          </button>
        )}
      </SidebarMenuButton>
      {children && <div className="mt-1">{children}</div>}
    </SidebarMenuItem>
  );
}

