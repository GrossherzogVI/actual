import React from 'react';
import type { ComponentType, SVGProps, CSSProperties } from 'react';
import { useLocation } from 'react-router';

import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Link } from '@desktop-client/components/common/Link';

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
      <span className={bold ? 'font-semibold' : ''}>{title}</span>
    </>
  );

  return (
    <SidebarMenuItem style={{ paddingLeft: indent }}>
      <SidebarMenuButton
        asChild
        size="sm"
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
    </SidebarMenuItem>
  );
}

