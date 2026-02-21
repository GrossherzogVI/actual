export type ForecastEvent = {
  date: string; // YYYY-MM-DD
  amount: number; // cents (positive = income, negative = expense)
  description: string;
  sourceType: 'schedule' | 'contract' | 'invoice';
  sourceId: string;
};

export type DailyBalance = {
  date: string;
  balance: number; // cents
  events: ForecastEvent[];
};

export type ForecastResult = {
  dailyCurve: DailyBalance[];
  worstPoint: { date: string; balance: number };
  safeToSpend: number; // cents — min balance above zero over next 30 days
  monthlyNetCashflow: { month: string; net: number }[];
};
