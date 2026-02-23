import React from 'react';
import type { ComponentType, SVGProps, ReactNode, CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router';

import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

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
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{title}</span>
    </>
  );

  return (
    <SidebarMenuItem style={{ paddingLeft: indent }}>
      <SidebarMenuButton
        asChild={!!to}
        isActive={isActive}
        onClick={!to ? onClick : undefined}
        tooltip={title}
      >
        {to ? (
          <NavLink to={to}>
            {content}
          </NavLink>
        ) : (
          content
        )}
      </SidebarMenuButton>
      {children && <div className="mt-1">{children}</div>}
    </SidebarMenuItem>
  );
}

