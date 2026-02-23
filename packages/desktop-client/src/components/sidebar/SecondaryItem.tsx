import React from 'react';
import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { NavLink, useLocation } from 'react-router';

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

type SecondaryItemProps = {
  title: string;
  to?: string;
  Icon?:
    | ComponentType<SVGProps<SVGElement>>
    | ComponentType<SVGProps<SVGSVGElement>>;
  style?: CSSProperties;
  onClick?: () => void;
  bold?: boolean;
  indent?: number;
};

export function SecondaryItem({
  Icon,
  title,
  to,
  onClick,
  bold,
  indent = 0,
}: SecondaryItemProps) {
  const location = useLocation();
  const isActive = to ? location.pathname.startsWith(to) : false;

  const content = (
    <>
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      <span className={`truncate ${bold ? 'font-semibold' : ''}`}>{title}</span>
    </>
  );

  return (
    <SidebarMenuItem style={{ paddingLeft: indent }}>
      <SidebarMenuButton
        asChild={!!to}
        size="sm"
        isActive={isActive}
        onClick={!to ? onClick : undefined}
        tooltip={title}
        className={
          isActive ? 'border-l-2 border-sidebar-primary rounded-l-none' : ''
        }
      >
        {to ? <NavLink to={to}>{content}</NavLink> : content}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
