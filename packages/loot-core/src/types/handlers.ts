import type { AccountHandlers } from '../server/accounts/app';
import type { AdminHandlers } from '../server/admin/app';
import type { AuthHandlers } from '../server/auth/app';
import type { BudgetHandlers } from '../server/budget/app';
import type { BudgetFileHandlers } from '../server/budgetfiles/app';
import type { DashboardHandlers } from '../server/dashboard/app';
import type { EncryptionHandlers } from '../server/encryption/app';
import type { FiltersHandlers } from '../server/filters/app';
import type { NotesHandlers } from '../server/notes/app';
import type { PayeesHandlers } from '../server/payees/app';
import type { PreferencesHandlers } from '../server/preferences/app';
import type { ReportsHandlers } from '../server/reports/app';
import type { RulesHandlers } from '../server/rules/app';
import type { SchedulesHandlers } from '../server/schedules/app';
import type { SpreadsheetHandlers } from '../server/spreadsheet/app';
import type { SyncHandlers } from '../server/sync/app';
import type { TagsHandlers } from '../server/tags/app';
import type { ToolsHandlers } from '../server/tools/app';
import type { TransactionHandlers } from '../server/transactions/app';
import type { WebhookHandlers } from '../server/webhooks/app';
import type { AIHandlers } from '../server/ai/app';
import type { ContractHandlers } from '../server/contracts/app';
import type { ReviewHandlers } from '../server/review/app';
import type { ImportDataHandlers } from '../server/import-data/app';
import type { CategoriesSetupHandlers } from '../server/categories-setup/app';
import type { QuickAddHandlers } from '../server/quick-add/app';

import type { ApiHandlers } from './api-handlers';
import type { ServerHandlers } from './server-handlers';

export type Handlers = {} & ServerHandlers &
  ApiHandlers &
  BudgetHandlers &
  DashboardHandlers &
  FiltersHandlers &
  NotesHandlers &
  PreferencesHandlers &
  ReportsHandlers &
  RulesHandlers &
  SchedulesHandlers &
  TransactionHandlers &
  AdminHandlers &
  ToolsHandlers &
  AccountHandlers &
  PayeesHandlers &
  SpreadsheetHandlers &
  SyncHandlers &
  BudgetFileHandlers &
  EncryptionHandlers &
  TagsHandlers &
  AuthHandlers &
  WebhookHandlers &
  ContractHandlers &
  AIHandlers &
  ReviewHandlers &
  ImportDataHandlers &
  CategoriesSetupHandlers &
  QuickAddHandlers;

export type HandlerFunctions = Handlers[keyof Handlers];
