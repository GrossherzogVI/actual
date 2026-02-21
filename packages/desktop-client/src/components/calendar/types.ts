export interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  amount: number; // cents, negative = expense
  type: 'schedule' | 'contract';
  sourceId: string; // schedule_id or contract_id
  accountName?: string;
  contractType?: string;
  interval?: string;
}

export interface WeekData {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  entries: CalendarEntry[];
  totalAmount: number; // sum of all entries (cents)
  runningBalance: number; // projected balance at end of week (cents)
}

export type CalendarView = 'list' | 'month';
