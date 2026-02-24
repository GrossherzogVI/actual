import { type ReactNode } from 'react';

export type WidgetLayout = {
  id: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

export const DEFAULT_LAYOUT: WidgetLayout[] = [
  { id: 'money-pulse',        col: 1,  row: 1, colSpan: 12, rowSpan: 1 },
  { id: 'account-balances',   col: 1,  row: 2, colSpan: 4,  rowSpan: 2 },
  { id: 'this-month',         col: 5,  row: 2, colSpan: 4,  rowSpan: 1 },
  { id: 'cash-runway',        col: 9,  row: 2, colSpan: 4,  rowSpan: 1 },
  { id: 'available-to-spend', col: 5,  row: 3, colSpan: 4,  rowSpan: 1 },
  { id: 'balance-projection', col: 9,  row: 3, colSpan: 4,  rowSpan: 1 },
  { id: 'upcoming-payments',  col: 1,  row: 4, colSpan: 6,  rowSpan: 1 },
  { id: 'health-score',       col: 7,  row: 4, colSpan: 6,  rowSpan: 1 },
];

type DashboardGridProps = {
  children: ReactNode;
  layout?: WidgetLayout[];
};

export function DashboardGrid({ children, layout = DEFAULT_LAYOUT }: DashboardGridProps) {
  // Children are positioned by the caller using the layout constants.
  // This component provides the grid container; children must set their own
  // gridColumn and gridRow via inline styles or CSS classes.
  void layout; // layout exported for use by callers; grid CSS handles placement

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '20px',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Helper: convert a WidgetLayout entry to inline style for grid placement.
 */
export function layoutStyle(item: WidgetLayout): React.CSSProperties {
  return {
    gridColumn: `${item.col} / span ${item.colSpan}`,
    gridRow: `${item.row} / span ${item.rowSpan}`,
  };
}
