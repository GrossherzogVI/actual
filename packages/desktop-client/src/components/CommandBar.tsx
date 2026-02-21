import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import {
  SvgAdd,
  SvgCog,
  SvgCreditCard,
  SvgLibrary,
  SvgPiggyBank,
  SvgReports,
  SvgStoreFront,
  SvgTag,
  SvgTuning,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import {
  SvgCalendar3,
  SvgNotesPaperText,
} from '@actual-app/components/icons/v2';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';
import { Command } from 'cmdk';
import { send } from 'loot-core/platform/client/connection';

import { CellValue, CellValueText } from './spreadsheet/CellValue';

import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useDashboardPages } from '@desktop-client/hooks/useDashboardPages';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { useModalState } from '@desktop-client/hooks/useModalState';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useReports } from '@desktop-client/hooks/useReports';
import type {
  Binding,
  SheetFields,
  SheetNames,
} from '@desktop-client/spreadsheet';
import {
  accountBalance,
  allAccountBalance,
  offBudgetAccountBalance,
  onBudgetAccountBalance,
} from '@desktop-client/spreadsheet/bindings';

type SearchableItem = {
  id: string;
  /** The name to display and use for searching */
  name: string;
  /**
   * The item content to display. If not provided, {@link SearchableItem.name `name`} will be used.
   *
   * Meant for complex items that want to display more than just static text.
   */
  content?: ReactNode;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type SearchSection = {
  key: string;
  heading: string;
  items: Readonly<SearchableItem[]>;
  onSelect: (item: Pick<SearchableItem, 'id'>) => void;
};

type ContractEntry = {
  id: string;
  name: string;
  amount: number | null;
  interval: string | null;
};

/** Simple arithmetic expression evaluator — supports +, -, *, / with parens */
function evalMath(expr: string): number | null {
  // Allow only digits, operators, spaces, dots, parens
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  try {
    // Build a safe evaluator without eval()
    const tokens = expr.replace(/\s/g, '').match(/(\d+\.?\d*|[+\-*/()])/g);
    if (!tokens) return null;
    return parseMathExpr(tokens, { pos: 0 });
  } catch {
    return null;
  }
}

function parseMathExpr(tokens: string[], state: { pos: number }): number {
  let left = parseMathTerm(tokens, state);
  while (state.pos < tokens.length && (tokens[state.pos] === '+' || tokens[state.pos] === '-')) {
    const op = tokens[state.pos++];
    const right = parseMathTerm(tokens, state);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseMathTerm(tokens: string[], state: { pos: number }): number {
  let left = parseMathFactor(tokens, state);
  while (state.pos < tokens.length && (tokens[state.pos] === '*' || tokens[state.pos] === '/')) {
    const op = tokens[state.pos++];
    const right = parseMathFactor(tokens, state);
    if (op === '/' && right === 0) throw new Error('div/0');
    left = op === '*' ? left * right : left / right;
  }
  return left;
}

function parseMathFactor(tokens: string[], state: { pos: number }): number {
  const token = tokens[state.pos];
  if (token === '(') {
    state.pos++; // consume '('
    const val = parseMathExpr(tokens, state);
    state.pos++; // consume ')'
    return val;
  }
  if (token === '-') {
    state.pos++;
    return -parseMathFactor(tokens, state);
  }
  state.pos++;
  const num = parseFloat(token);
  if (isNaN(num)) throw new Error('invalid token');
  return num;
}

function BalanceRow<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
>({
  label,
  binding,
}: {
  label: string;
  binding: Binding<SheetName, FieldName>;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flex: 1,
      }}
    >
      <Text>{label}</Text>
      <CellValue binding={binding} type="financial">
        {props => (
          <CellValueText
            {...props}
            style={{ ...styles.tnum, whiteSpace: 'nowrap', opacity: 0.9 }}
          />
        )}
      </CellValue>
    </View>
  );
}

export function CommandBar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const [budgetName] = useMetadataPref('budgetName');
  const { modalStack } = useModalState();

  const contractManagementEnabled = useFeatureFlag('contractManagement');
  const extendedCommandBar = useFeatureFlag('extendedCommandBar');

  const [contracts, setContracts] = useState<ContractEntry[]>([]);
  useEffect(() => {
    if (!contractManagementEnabled || !open) return;
    void (send as Function)('contract-list', {}).then((result: unknown) => {
      if (Array.isArray(result)) {
        setContracts(result as ContractEntry[]);
      }
    });
  }, [contractManagementEnabled, open]);

  const navigationItems = useMemo(
    () => [
      { id: 'budget', name: t('Budget'), path: '/budget', Icon: SvgWallet },
      {
        id: 'reports-nav',
        name: t('Reports'),
        path: '/reports',
        Icon: SvgReports,
      },
      {
        id: 'schedules',
        name: t('Schedules'),
        path: '/schedules',
        Icon: SvgCalendar3,
      },
      { id: 'payees', name: t('Payees'), path: '/payees', Icon: SvgStoreFront },
      { id: 'rules', name: t('Rules'), path: '/rules', Icon: SvgTuning },
      { id: 'tags', name: t('Tags'), path: '/tags', Icon: SvgTag },
      { id: 'settings', name: t('Settings'), path: '/settings', Icon: SvgCog },
      {
        id: 'accounts',
        name: t('All Accounts'),
        path: '/accounts',
        content: (
          <BalanceRow<'account', 'accounts-balance'>
            label={t('All Accounts')}
            binding={allAccountBalance()}
          />
        ),
        Icon: SvgLibrary,
      },
    ],
    [t],
  );

  useEffect(() => {
    // Reset search when closing
    if (!open) setSearch('');
  }, [open]);

  const { data: allAccounts = [] } = useAccounts();
  const { data: customReports = [] } = useReports();
  const { data: dashboardPages = [] } = useDashboardPages();

  const accounts = allAccounts.filter(acc => !acc.closed);

  const openEventListener = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Do not open CommandBar if a modal is already open
        if (modalStack.length > 0) return;
        setOpen(true);
      }
    },
    [modalStack.length],
  );

  useEffect(() => {
    document.addEventListener('keydown', openEventListener);
    return () => document.removeEventListener('keydown', openEventListener);
  }, [openEventListener]);

  const handleNavigate = useCallback(
    (path: string) => {
      setOpen(false);
      void navigate(path);
    },
    [navigate],
  );

  // Determine the current input mode based on prefix
  const isActionMode = extendedCommandBar && search.startsWith('>');
  const isCalcMode = extendedCommandBar && search.startsWith('=');
  const isAmountMode =
    extendedCommandBar &&
    !isActionMode &&
    !isCalcMode &&
    (search.startsWith('€') || /^\d/.test(search));

  // Quick action items (mode: ">")
  const quickActionItems: SearchableItem[] = useMemo(
    () => [
      { id: 'qa-add-transaction', name: t('Add Transaction'), Icon: SvgAdd },
      { id: 'qa-new-contract', name: t('New Contract'), Icon: SvgNotesPaperText },
      { id: 'qa-review-queue', name: t('Review Queue'), Icon: SvgCreditCard },
      { id: 'qa-sync-all', name: t('Sync All'), Icon: SvgWallet },
      { id: 'qa-import-data', name: t('Import Data'), Icon: SvgLibrary },
      { id: 'qa-settings', name: t('Settings'), Icon: SvgCog },
    ],
    [t],
  );

  const handleQuickAction = useCallback(
    (id: string) => {
      setOpen(false);
      switch (id) {
        case 'qa-add-transaction':
          void navigate('/quick-add');
          break;
        case 'qa-new-contract':
          void navigate('/contracts?new=1');
          break;
        case 'qa-review-queue':
          void navigate('/review');
          break;
        case 'qa-sync-all':
          void (send as Function)('sync');
          break;
        case 'qa-import-data':
          void navigate('/import');
          break;
        case 'qa-settings':
          void navigate('/settings');
          break;
      }
    },
    [navigate],
  );

  // Calculator mode (mode: "=")
  const calcExpr = isCalcMode ? search.slice(1) : '';
  const calcResult = isCalcMode ? evalMath(calcExpr) : null;
  const calcItems: SearchableItem[] = useMemo(() => {
    if (!isCalcMode || calcExpr === '') return [];
    if (calcResult === null) {
      return [{ id: 'calc-invalid', name: t('Invalid expression'), Icon: SvgTuning }];
    }
    return [
      {
        id: 'calc-result',
        name: `= ${calcResult}`,
        content: (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}>
            <Text style={{ fontFamily: 'monospace' }}>{calcExpr} = {calcResult}</Text>
            <Text style={{ fontSize: '0.75rem', color: 'var(--color-pageTextSubdued)' }}>
              {t('Press Enter to copy')}
            </Text>
          </View>
        ),
        Icon: SvgTuning,
      },
    ];
  }, [isCalcMode, calcExpr, calcResult, t]);

  const handleCalcSelect = useCallback(
    (id: string) => {
      if (id === 'calc-result' && calcResult !== null) {
        void navigator.clipboard.writeText(String(calcResult));
      }
      setOpen(false);
    },
    [calcResult],
  );

  // Amount search stub (mode: "€" or digit)
  const amountItems: SearchableItem[] = useMemo(() => {
    if (!isAmountMode) return [];
    return [
      {
        id: 'amount-search',
        name: t('Search transactions by amount'),
        Icon: SvgCreditCard,
      },
    ];
  }, [isAmountMode, t]);

  const sections: SearchSection[] = [
    ...(isActionMode
      ? [
          {
            key: 'actions',
            heading: t('Actions'),
            items: quickActionItems.filter(item =>
              item.name.toLowerCase().includes(search.slice(1).toLowerCase()),
            ),
            onSelect: ({ id }: Pick<SearchableItem, 'id'>) => handleQuickAction(id),
          },
        ]
      : isCalcMode
        ? [
            {
              key: 'calculator',
              heading: t('Calculator'),
              items: calcItems,
              onSelect: ({ id }: Pick<SearchableItem, 'id'>) => handleCalcSelect(id),
            },
          ]
        : isAmountMode
          ? [
              {
                key: 'amount-search',
                heading: t('Transactions'),
                items: amountItems,
                onSelect: () => {
                  setOpen(false);
                  void navigate('/accounts');
                },
              },
            ]
          : [
              {
                key: 'navigation',
                heading: t('Navigation'),
                items: navigationItems,
                onSelect: ({ id }: Pick<SearchableItem, 'id'>) => {
                  const item = navigationItems.find(item => item.id === id);
                  if (item) handleNavigate(item.path);
                },
              },
              {
                key: 'accounts',
                heading: t('Accounts'),
                items: [
                  {
                    id: 'onbudget',
                    name: t('On Budget'),
                    content: (
                      <BalanceRow<'account', 'onbudget-accounts-balance'>
                        label={t('On Budget')}
                        binding={onBudgetAccountBalance()}
                      />
                    ),
                    Icon: SvgLibrary,
                  },
                  {
                    id: 'offbudget',
                    name: t('Off Budget'),
                    content: (
                      <BalanceRow<'account', 'offbudget-accounts-balance'>
                        label={t('Off Budget')}
                        binding={offBudgetAccountBalance()}
                      />
                    ),
                    Icon: SvgLibrary,
                  },
                  ...accounts.map(account => ({
                    ...account,
                    content: (
                      <BalanceRow<'account', 'balance'>
                        label={account.name}
                        binding={accountBalance(account.id)}
                      />
                    ),
                    Icon: SvgPiggyBank,
                  })),
                ],
                onSelect: ({ id }: Pick<SearchableItem, 'id'>) =>
                  handleNavigate(`/accounts/${id}`),
              },
              {
                key: 'reports',
                heading: t('Reports'),
                items: dashboardPages.map(dashboardPage => ({
                  ...dashboardPage,
                  Icon: SvgReports,
                })),
                onSelect: ({ id }: Pick<SearchableItem, 'id'>) =>
                  handleNavigate(`/reports/${id}`),
              },
              {
                key: 'reports-custom',
                heading: t('Custom Reports'),
                items: customReports.map(report => ({
                  ...report,
                  Icon: SvgNotesPaperText,
                })),
                onSelect: ({ id }: Pick<SearchableItem, 'id'>) =>
                  handleNavigate(`/reports/custom/${id}`),
              },
              ...(contractManagementEnabled
                ? [
                    {
                      key: 'contracts',
                      heading: t('Contracts'),
                      items: contracts.map(c => ({
                        id: c.id,
                        name: c.name,
                        content: (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flex: 1,
                            }}
                          >
                            <Text>{c.name}</Text>
                            {c.amount != null && c.interval && (
                              <Text
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--color-pageTextSubdued)',
                                }}
                              >
                                {(c.amount / 100).toFixed(2)} €/{c.interval}
                              </Text>
                            )}
                          </View>
                        ),
                        Icon: SvgNotesPaperText,
                      })),
                      onSelect: ({ id }: Pick<SearchableItem, 'id'>) =>
                        handleNavigate(`/contracts/${id}`),
                    },
                  ]
                : []),
            ]),
  ];

  const searchLower = search.toLowerCase();
  const filteredSections = sections.map(section => ({
    ...section,
    // For action/calc/amount modes the items are already pre-filtered above
    items:
      isActionMode || isCalcMode || isAmountMode
        ? section.items
        : section.items.filter(item =>
            item.name.toLowerCase().includes(searchLower),
          ),
  }));
  const hasResults = filteredSections.some(section => !!section.items.length);

  return (
    <Command.Dialog
      vimBindings
      open={open}
      onOpenChange={setOpen}
      label={t('Command Bar')}
      aria-label={t('Command Bar')}
      shouldFilter={false}
      className={css({
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -30%)',
        width: '90%',
        maxWidth: '600px',
        backgroundColor: 'var(--color-modalBackground)',
        border: '1px solid var(--color-modalBorder)',
        color: 'var(--color-pageText)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        zIndex: 3001,
      })}
    >
      <Command.Input
        autoFocus
        placeholder={
          extendedCommandBar
            ? t('Search, > actions, = calc, € amount...')
            : t('Search {{budgetName}}...', { budgetName })
        }
        value={search}
        onValueChange={setSearch}
        className={css({
          width: '100%',
          padding: '12px 16px',
          fontSize: '1rem',
          border: 'none',
          borderBottom: '1px solid var(--color-tableBorderSeparator)',
          backgroundColor: 'transparent',
          color: 'var(--color-pageText)',
          outline: 'none',
          '&::placeholder': {
            color: 'var(--color-pageTextSubdued)',
          },
        })}
      />
      <Command.List
        className={css({
          maxHeight: '300px',
          overflowY: 'auto',
          padding: '8px 0',
          // Hide the scrollbar
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          // Ensure content is still scrollable
          msOverflowStyle: 'none',
        })}
      >
        {filteredSections.map(
          section =>
            !!section.items.length && (
              <Command.Group
                key={section.key}
                heading={section.heading}
                className={css({
                  padding: '0 8px',
                  '& [cmdk-group-heading]': {
                    padding: '8px 8px 4px',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'var(--color-pageTextSubdued)',
                    textTransform: 'uppercase',
                  },
                })}
              >
                {section.items.map(({ id, name, Icon, content }) => (
                  <Command.Item
                    key={id}
                    onSelect={() => section.onSelect({ id })}
                    value={name}
                    className={css({
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      borderRadius: '4px',
                      margin: '0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      // Avoid showing mouse hover styles when using keyboard navigation
                      '[data-cmdk-list]:not([data-cmdk-list-nav-active]) &:hover':
                        {
                          backgroundColor:
                            'var(--color-menuItemBackgroundHover)',
                          color: 'var(--color-menuItemTextHover)',
                        },

                      "&[data-selected='true']": {
                        backgroundColor: 'var(--color-menuItemBackgroundHover)',
                        color: 'var(--color-menuItemTextHover)',
                      },
                    })}
                  >
                    <Icon width={16} height={16} />
                    {content || name}
                  </Command.Item>
                ))}
              </Command.Group>
            ),
        )}

        {!hasResults && (
          <Command.Empty
            className={css({
              padding: '16px',
              textAlign: 'center',
              fontSize: '0.9rem',
              color: 'var(--color-pageTextSubdued)',
            })}
          >
            <Trans>No results found</Trans>
          </Command.Empty>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
