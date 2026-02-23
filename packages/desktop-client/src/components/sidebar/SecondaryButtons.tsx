import React from 'react';
import type { ComponentType, SVGProps } from 'react';

import { SecondaryItem } from './SecondaryItem';

type SecondaryButtonItems = {
  title: string;
  Icon:
    | ComponentType<SVGProps<SVGElement>>
    | ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
};

type SecondaryButtonsProps = {
  buttons: Array<SecondaryButtonItems>;
};

export function SecondaryButtons({ buttons }: SecondaryButtonsProps) {
  return (
    <>
      {buttons.map(item => (
        <SecondaryItem
          key={item.title}
          title={item.title}
          Icon={item.Icon}
          onClick={item.onClick}
        />
      ))}
    </>
  );
}
