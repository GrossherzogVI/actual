import React from 'react';
import { useTranslation } from 'react-i18next';

import { SvgAdd } from '@actual-app/components/icons/v1';

import { Accounts } from './Accounts';
import { BudgetName } from './BudgetName';
import { PrimaryButtons } from './PrimaryButtons';
import { SecondaryButtons } from './SecondaryButtons';
import { ToggleButton } from './ToggleButton';

import { replaceModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar';

export function Sidebar() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { isMobile, state } = useSidebar();

  const onAddAccount = () => {
    dispatch(replaceModal({ modal: { name: 'add-account', options: {} } }));
  };

  return (
    <ShadcnSidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="pt-3 flex flex-row items-center justify-between">
        {state === 'expanded' ? (
          <BudgetName>
            <ToggleButton />
          </BudgetName>
        ) : (
          <div className="flex justify-center w-full">
            <ToggleButton />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="px-2">
          <PrimaryButtons />
        </SidebarMenu>

        <Accounts />

        <SidebarMenu className="px-2 mt-auto pb-4">
          <SecondaryButtons
            buttons={[
              { title: t('Add account'), Icon: SvgAdd, onClick: onAddAccount },
            ]}
          />
        </SidebarMenu>
      </SidebarContent>

      <SidebarRail />
    </ShadcnSidebar>
  );
}
