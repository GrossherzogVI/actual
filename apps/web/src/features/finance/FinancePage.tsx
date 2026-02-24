import { lazy, Suspense, useEffect, useState } from 'react';

import { motion } from 'motion/react';
import {
  BarChart3,
  CalendarDays,
  Camera,
  CreditCard,
  FileSearch,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  List,
  PiggyBank,
  Tags,
  Upload,
} from 'lucide-react';

import { AccountPanel } from './AccountPanel';
import { CategoryTree } from './CategoryTree';
import { TransactionList } from './TransactionList';

// Lazy-load Phase 1 panels (created by agents, safe to lazy-import)
const DashboardPage = lazy(() =>
  import('../dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })),
);
const ContractsPage = lazy(() =>
  import('../contracts/ContractsPage').then(m => ({ default: m.ContractsPage })),
);
const CalendarPage = lazy(() =>
  import('../calendar/CalendarPage').then(m => ({ default: m.CalendarPage })),
);
const CategoriesPage = lazy(() =>
  import('../categories/CategoriesPage').then(m => ({ default: m.CategoriesPage })),
);
const ReviewQueuePage = lazy(() =>
  import('../review/ReviewQueuePage').then(m => ({ default: m.ReviewQueuePage })),
);
const AnalyticsPage = lazy(() =>
  import('../analytics/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })),
);
const ImportPage = lazy(() =>
  import('../import/ImportPage').then(m => ({ default: m.ImportPage })),
);
const BudgetPage = lazy(() =>
  import('../budget/BudgetPage').then(m => ({ default: m.BudgetPage })),
);
const TaxExportPage = lazy(() =>
  import('../tax/TaxExportPage').then(m => ({ default: m.TaxExportPage })),
);
const ReceiptInbox = lazy(() =>
  import('../ocr/ReceiptInbox').then(m => ({ default: m.ReceiptInbox })),
);
const SepaExportPage = lazy(() =>
  import('../sepa/SepaExportPage').then(m => ({ default: m.SepaExportPage })),
);

type FinanceTab = 'dashboard' | 'transactions' | 'contracts' | 'calendar' | 'categories' | 'review' | 'analytics' | 'import' | 'budget' | 'tax' | 'receipts' | 'sepa';

const TABS: { id: FinanceTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transaktionen', icon: List },
  { id: 'contracts', label: 'Verträge', icon: FileText },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
  { id: 'categories', label: 'Kategorien', icon: Tags },
  { id: 'review', label: 'Prüfungen', icon: FileSearch },
  { id: 'analytics', label: 'Analysen', icon: BarChart3 },
  { id: 'import', label: 'Import', icon: Upload },
  { id: 'budget', label: 'Budget', icon: PiggyBank },
  { id: 'tax', label: 'Steuer', icon: FileSpreadsheet },
  { id: 'receipts', label: 'Belege', icon: Camera },
  { id: 'sepa', label: 'SEPA', icon: CreditCard },
];

function TabFallback() {
  return (
    <div className="fo-panel">
      <div className="fo-stack p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-12 rounded-md bg-[var(--fo-bg)] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function FinancePage() {
  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();

  // Listen for tab switch events from command palette
  useEffect(() => {
    function handleTabEvent(e: Event) {
      const tab = (e as CustomEvent<FinanceTab>).detail;
      if (tab) setActiveTab(tab);
    }
    window.addEventListener('finance-tab', handleTabEvent);
    return () => window.removeEventListener('finance-tab', handleTabEvent);
  }, []);

  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Tab navigation */}
      <nav className="flex gap-1 px-5 pt-3 pb-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`fo-row px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                  : 'text-[var(--fo-muted)] hover:text-[var(--fo-text)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'dashboard' && (
          <Suspense fallback={<TabFallback />}>
            <DashboardPage />
          </Suspense>
        )}

        {activeTab === 'transactions' && (
          <div
            className="grid gap-5 p-5 h-full"
            style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}
          >
            <div className="fo-column" style={{ gap: 16, alignContent: 'start', overflow: 'auto' }}>
              <AccountPanel
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
              />
              <CategoryTree
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
              />
            </div>
            <div className="min-h-0 overflow-auto">
              <TransactionList
                accountId={selectedAccountId}
                categoryId={selectedCategoryId}
              />
            </div>
          </div>
        )}

        {activeTab === 'contracts' && (
          <Suspense fallback={<TabFallback />}>
            <ContractsPage />
          </Suspense>
        )}

        {activeTab === 'calendar' && (
          <Suspense fallback={<TabFallback />}>
            <CalendarPage />
          </Suspense>
        )}

        {activeTab === 'categories' && (
          <Suspense fallback={<TabFallback />}>
            <CategoriesPage />
          </Suspense>
        )}

        {activeTab === 'review' && (
          <Suspense fallback={<TabFallback />}>
            <ReviewQueuePage />
          </Suspense>
        )}

        {activeTab === 'analytics' && (
          <Suspense fallback={<TabFallback />}>
            <AnalyticsPage />
          </Suspense>
        )}

        {activeTab === 'import' && (
          <Suspense fallback={<TabFallback />}>
            <ImportPage />
          </Suspense>
        )}

        {activeTab === 'budget' && (
          <Suspense fallback={<TabFallback />}>
            <BudgetPage />
          </Suspense>
        )}

        {activeTab === 'tax' && (
          <Suspense fallback={<TabFallback />}>
            <TaxExportPage />
          </Suspense>
        )}

        {activeTab === 'receipts' && (
          <Suspense fallback={<TabFallback />}>
            <ReceiptInbox />
          </Suspense>
        )}

        {activeTab === 'sepa' && (
          <Suspense fallback={<TabFallback />}>
            <SepaExportPage />
          </Suspense>
        )}
      </div>
    </motion.div>
  );
}
