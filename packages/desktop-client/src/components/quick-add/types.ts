// @ts-strict-ignore

export type QuickAddFormData = {
  amount: string; // raw input (may contain math)
  evaluatedAmount: number | null; // cents
  categoryId: string;
  categoryName: string;
  payee: string;
  accountId: string;
  date: string; // YYYY-MM-DD, defaults to today
  notes: string;
};

export type Preset = {
  id: string;
  label: string;
  icon: string; // emoji or icon name
  amount: number | null; // cents
  categoryId: string | null;
  categoryName: string | null; // target category name for runtime resolution
  payee: string | null;
  accountId: string | null;
  sortOrder: number;
  isAuto: boolean; // auto-learned vs user-pinned
};

export type FrecencyEntry = {
  categoryId: string;
  useCount: number;
  lastUsedAt: string | null;
  score: number;
};

export type RecentTemplate = {
  payee: string;
  amount: number; // cents
  categoryId: string;
  categoryName: string;
  accountId: string;
  date: string;
};

export type Category = {
  id: string;
  name: string;
  group_id: string;
  group_name?: string;
};
