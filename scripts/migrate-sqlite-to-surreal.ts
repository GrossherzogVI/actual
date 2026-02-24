/**
 * SQLite-to-SurrealDB Migration Script
 *
 * Migrates Actual Budget's account.sqlite data into SurrealDB.
 * Reads: accounts, category_groups, categories, payees, transactions, schedules
 * Writes: account, category (L1+L2), payee, transaction, schedule
 *
 * Usage:
 *   npx tsx migrate-sqlite-to-surreal.ts --sqlite /path/to/account.sqlite
 *   npx tsx migrate-sqlite-to-surreal.ts --sqlite /path/to/account.sqlite --dry-run
 *   npx tsx migrate-sqlite-to-surreal.ts --sqlite /path/to/account.sqlite --surreal ws://localhost:8000
 */

import Database from 'better-sqlite3';
import Surreal, { RecordId, Table } from 'surrealdb';

// ─── CLI Arg Parsing ────────────────────────────────────────────────────────────

interface Args {
  sqlite: string;
  surreal: string;
  ns: string;
  db: string;
  user: string;
  pass: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    sqlite: '',
    surreal: 'ws://localhost:8000',
    ns: 'finance',
    db: 'main',
    user: 'root',
    pass: 'root',
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--sqlite':
        args.sqlite = argv[++i];
        break;
      case '--surreal':
        args.surreal = argv[++i];
        break;
      case '--ns':
        args.ns = argv[++i];
        break;
      case '--db':
        args.db = argv[++i];
        break;
      case '--user':
        args.user = argv[++i];
        break;
      case '--pass':
        args.pass = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        if (argv[i].startsWith('-')) {
          console.error(`Unknown argument: ${argv[i]}`);
          process.exit(1);
        }
    }
  }

  if (!args.sqlite) {
    console.error('Error: --sqlite <path> is required');
    console.error(
      'Usage: npx tsx migrate-sqlite-to-surreal.ts --sqlite /path/to/account.sqlite [options]',
    );
    console.error('Options:');
    console.error(
      '  --surreal <url>      SurrealDB URL (default: ws://localhost:8000)',
    );
    console.error(
      '  --ns <namespace>     Namespace (default: finance)',
    );
    console.error(
      '  --db <database>      Database (default: main)',
    );
    console.error(
      '  --user <username>    Username (default: root)',
    );
    console.error(
      '  --pass <password>    Password (default: root)',
    );
    console.error(
      '  --dry-run            Count records without inserting',
    );
    process.exit(1);
  }

  return args;
}

// ─── ID Helpers ─────────────────────────────────────────────────────────────────

/** Convert Actual UUID (e.g. "a1b2c3d4-e5f6-...") to a SurrealDB-safe ID string */
function sanitizeId(id: string): string {
  // SurrealDB record IDs can contain hyphens if quoted, but using underscores is safer
  return id.replace(/-/g, '_');
}

function makeRecordId(table: string, id: string): RecordId {
  return new RecordId(table, sanitizeId(id));
}

// ─── Date Helpers ───────────────────────────────────────────────────────────────

/** Convert Actual's YYYYMMDD integer date to ISO datetime string */
function actualDateToISO(dateInt: number | null): string | null {
  if (dateInt == null || dateInt === 0) return null;
  const s = String(dateInt).padStart(8, '0');
  const year = s.slice(0, 4);
  const month = s.slice(4, 6);
  const day = s.slice(6, 8);
  return `${year}-${month}-${day}T00:00:00Z`;
}

// ─── Batch Insert Helper ────────────────────────────────────────────────────────

const BATCH_SIZE = 100;

async function batchInsert(
  surreal: Surreal,
  table: string,
  records: Record<string, unknown>[],
  label: string,
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    // Build a single multi-statement query for the batch
    let query = '';
    const params: Record<string, unknown> = {};

    for (let j = 0; j < batch.length; j++) {
      const paramKey = `r${j}`;
      query += `CREATE $${paramKey}_id CONTENT $${paramKey};\n`;
      params[`${paramKey}_id`] = batch[j].id;
      // Clone record without the id field (it's in the record ID)
      const { id, ...data } = batch[j];
      params[paramKey] = data;
    }

    await surreal.query(query, params);
    inserted += batch.length;

    const progress = Math.min(inserted, records.length);
    process.stdout.write(
      `\r  ${label}: ${progress}/${records.length}`,
    );
  }

  console.log(); // newline after progress
  return inserted;
}

// ─── Account Type Mapping ───────────────────────────────────────────────────────

/** Map Actual account types to SurrealDB schema enum */
function mapAccountType(
  type: string | null,
  subtype: string | null,
  offbudget: number,
): string {
  // Actual types from Plaid: checking, savings, credit, loan, investment, etc.
  // SurrealDB schema allows: checking, savings, credit, cash, investment
  if (type === 'credit') return 'credit';
  if (type === 'savings') return 'savings';
  if (type === 'investment' || subtype === 'investment') return 'investment';
  if (type === 'checking') return 'checking';
  // Default unknown types to checking (most common)
  return 'checking';
}

// ─── Schedule Frequency Mapping ─────────────────────────────────────────────────

/**
 * Actual schedules store their recurrence rule in the `rules` table as JSON.
 * The schedule itself has limited fields. We attempt to extract frequency from
 * the rule JSON linked via schedules_json_paths.
 */
function mapFrequency(ruleConditions: string | null): string {
  if (!ruleConditions) return 'monthly';

  try {
    const conditions = JSON.parse(ruleConditions);
    // Actual stores date conditions with { type: 'date', value: { frequency: ... } }
    for (const cond of conditions) {
      if (cond.field === 'date' && cond.value?.frequency) {
        const freq = cond.value.frequency;
        if (freq === 'weekly') return 'weekly';
        if (freq === 'monthly') return 'monthly';
        if (freq === 'yearly') return 'yearly';
      }
    }
  } catch {
    // Invalid JSON, fall back to monthly
  }

  return 'monthly';
}

// ─── Main Migration ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('=== SQLite -> SurrealDB Migration ===');
  console.log(`  SQLite:   ${args.sqlite}`);
  console.log(`  SurrealDB: ${args.surreal}`);
  console.log(`  Namespace: ${args.ns}`);
  console.log(`  Database:  ${args.db}`);
  console.log(`  Dry run:   ${args.dryRun}`);
  console.log('');

  // ── Open SQLite ─────────────────────────────────────────────────────────────

  let sqlite: Database.Database;
  try {
    sqlite = new Database(args.sqlite, { readonly: true });
  } catch (err) {
    console.error(`Failed to open SQLite database: ${args.sqlite}`);
    console.error(err);
    process.exit(1);
  }

  // ── Read SQLite Data ────────────────────────────────────────────────────────

  console.log('Reading SQLite data...');

  // Category groups (L1 categories)
  const categoryGroups = sqlite
    .prepare(
      `SELECT id, name, is_income, sort_order
       FROM category_groups
       WHERE tombstone = 0
       ORDER BY sort_order`,
    )
    .all() as {
    id: string;
    name: string;
    is_income: number;
    sort_order: number | null;
  }[];
  console.log(`  Category groups: ${categoryGroups.length}`);

  // Categories (L2 categories)
  const categories = sqlite
    .prepare(
      `SELECT id, name, cat_group, is_income, sort_order
       FROM categories
       WHERE tombstone = 0
       ORDER BY sort_order`,
    )
    .all() as {
    id: string;
    name: string;
    cat_group: string;
    is_income: number;
    sort_order: number | null;
  }[];
  console.log(`  Categories:      ${categories.length}`);

  // Accounts
  const accounts = sqlite
    .prepare(
      `SELECT id, account_id, name, type, subtype, balance_current, offbudget, closed, sort_order
       FROM accounts
       WHERE tombstone = 0
       ORDER BY sort_order`,
    )
    .all() as {
    id: string;
    account_id: string | null;
    name: string;
    type: string | null;
    subtype: string | null;
    balance_current: number | null;
    offbudget: number;
    closed: number;
    sort_order: number | null;
  }[];
  console.log(`  Accounts:        ${accounts.length}`);

  // Payees
  const payees = sqlite
    .prepare(
      `SELECT id, name, transfer_acct
       FROM payees
       WHERE tombstone = 0
       ORDER BY name`,
    )
    .all() as {
    id: string;
    name: string;
    transfer_acct: string | null;
  }[];
  console.log(`  Payees:          ${payees.length}`);

  // Transactions — join payee_mapping to resolve description -> payee,
  // and category_mapping to resolve category -> actual category
  const transactions = sqlite
    .prepare(
      `SELECT t.id, t.date, t.amount, t.acct,
              COALESCE(cm.transferId, t.category) AS category,
              pm.targetId AS payee,
              t.notes, t.cleared, t.reconciled,
              t.transferred_id, t.isParent, t.isChild,
              t.schedule, t.imported_description
       FROM transactions t
       LEFT JOIN payee_mapping pm ON pm.id = t.description
       LEFT JOIN category_mapping cm ON cm.id = t.category
       WHERE t.tombstone = 0 AND t.date IS NOT NULL AND t.acct IS NOT NULL
       ORDER BY t.date DESC`,
    )
    .all() as {
    id: string;
    date: number;
    amount: number;
    acct: string;
    category: string | null;
    payee: string | null;
    notes: string | null;
    cleared: number;
    reconciled: number;
    transferred_id: string | null;
    isParent: number;
    isChild: number;
    schedule: string | null;
    imported_description: string | null;
  }[];
  console.log(`  Transactions:    ${transactions.length}`);

  // Schedules — join with rules to get conditions (which contain frequency)
  const schedules = sqlite
    .prepare(
      `SELECT s.id, s.rule, s.active, s.completed, s.posts_transaction,
              r.conditions, r.actions,
              sn.local_next_date, sn.base_next_date,
              sjp.payee AS jp_payee, sjp.account AS jp_account,
              sjp.amount AS jp_amount, sjp.date AS jp_date
       FROM schedules s
       LEFT JOIN rules r ON r.id = s.rule
       LEFT JOIN schedules_next_date sn ON sn.schedule_id = s.id
       LEFT JOIN schedules_json_paths sjp ON sjp.schedule_id = s.id
       WHERE s.tombstone = 0`,
    )
    .all() as {
    id: string;
    rule: string | null;
    active: number;
    completed: number;
    posts_transaction: number;
    conditions: string | null;
    actions: string | null;
    local_next_date: number | null;
    base_next_date: number | null;
    jp_payee: string | null;
    jp_account: string | null;
    jp_amount: string | null;
    jp_date: string | null;
  }[];
  console.log(`  Schedules:       ${schedules.length}`);

  const totalSourceRecords =
    categoryGroups.length +
    categories.length +
    accounts.length +
    payees.length +
    transactions.length +
    schedules.length;

  console.log(`  TOTAL:           ${totalSourceRecords}`);
  console.log('');

  if (args.dryRun) {
    console.log('Dry run complete. No data was written to SurrealDB.');
    sqlite.close();
    return;
  }

  // ── Connect SurrealDB ───────────────────────────────────────────────────────

  console.log('Connecting to SurrealDB...');
  const surreal = new Surreal();

  try {
    await surreal.connect(args.surreal);
    await surreal.signin({ username: args.user, password: args.pass });
    await surreal.use({ namespace: args.ns, database: args.db });
    console.log('  Connected successfully.');
  } catch (err) {
    console.error('Failed to connect to SurrealDB:');
    console.error(err);
    sqlite.close();
    process.exit(1);
  }

  console.log('');
  console.log('Migrating data...');

  const counts = {
    categoryGroups: 0,
    categories: 0,
    accounts: 0,
    payees: 0,
    transactions: 0,
    schedules: 0,
  };

  // Build lookup sets for referential integrity checks
  const validAccountIds = new Set(accounts.map((a) => a.id));
  const validCategoryIds = new Set([
    ...categoryGroups.map((cg) => cg.id),
    ...categories.map((c) => c.id),
  ]);
  const validPayeeIds = new Set(payees.map((p) => p.id));

  // ── 1. Category Groups (L1) ─────────────────────────────────────────────────

  const categoryGroupRecords = categoryGroups.map((cg) => ({
    id: makeRecordId('category', cg.id),
    name: cg.name || 'Unnamed Group',
    parent: null,
    color: null,
    icon: null,
    sort_order: Math.round(cg.sort_order ?? 0),
    is_income: cg.is_income === 1,
    created_at: new Date().toISOString(),
  }));

  counts.categoryGroups = await batchInsert(
    surreal,
    'category',
    categoryGroupRecords,
    'Category groups (L1)',
  );

  // ── 2. Categories (L2) ─────────────────────────────────────────────────────

  const categoryRecords = categories.map((c) => ({
    id: makeRecordId('category', c.id),
    name: c.name || 'Unnamed Category',
    parent: makeRecordId('category', c.cat_group),
    color: null,
    icon: null,
    sort_order: Math.round(c.sort_order ?? 0),
    is_income: c.is_income === 1,
    created_at: new Date().toISOString(),
  }));

  counts.categories = await batchInsert(
    surreal,
    'category',
    categoryRecords,
    'Categories (L2)',
  );

  // ── 3. Accounts ─────────────────────────────────────────────────────────────

  const accountRecords = accounts.map((a) => ({
    id: makeRecordId('account', a.id),
    name: a.name || 'Unnamed Account',
    type: mapAccountType(a.type, a.subtype, a.offbudget),
    balance: (a.balance_current ?? 0) / 100,
    currency: 'EUR',
    closed: a.closed === 1,
    sort_order: Math.round(a.sort_order ?? 0),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  counts.accounts = await batchInsert(
    surreal,
    'account',
    accountRecords,
    'Accounts',
  );

  // ── 4. Payees ───────────────────────────────────────────────────────────────

  const payeeRecords = payees.map((p) => ({
    id: makeRecordId('payee', p.id),
    name: p.name || 'Unknown Payee',
    transfer_account:
      p.transfer_acct && validAccountIds.has(p.transfer_acct)
        ? makeRecordId('account', p.transfer_acct)
        : null,
    created_at: new Date().toISOString(),
  }));

  counts.payees = await batchInsert(
    surreal,
    'payee',
    payeeRecords,
    'Payees',
  );

  // ── 5. Transactions ────────────────────────────────────────────────────────

  // Filter out transactions with invalid account references
  const validTransactions = transactions.filter((t) => {
    if (!t.acct || !validAccountIds.has(t.acct)) {
      return false;
    }
    return true;
  });

  const skippedTransactions =
    transactions.length - validTransactions.length;
  if (skippedTransactions > 0) {
    console.log(
      `  (Skipping ${skippedTransactions} transactions with missing account references)`,
    );
  }

  const transactionRecords = validTransactions.map((t) => ({
    id: makeRecordId('transaction', t.id),
    date: actualDateToISO(t.date) ?? new Date().toISOString(),
    amount: t.amount / 100,
    account: makeRecordId('account', t.acct),
    payee:
      t.payee && validPayeeIds.has(t.payee)
        ? makeRecordId('payee', t.payee)
        : null,
    category:
      t.category && validCategoryIds.has(t.category)
        ? makeRecordId('category', t.category)
        : null,
    notes: t.notes || null,
    imported: !!t.imported_description,
    cleared: t.cleared === 1,
    reconciled: t.reconciled === 1,
    transfer_id:
      t.transferred_id
        ? makeRecordId('transaction', t.transferred_id)
        : null,
    ai_confidence: null,
    ai_classified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  counts.transactions = await batchInsert(
    surreal,
    'transaction',
    transactionRecords,
    'Transactions',
  );

  // ── 6. Schedules ──────────────────────────────────────────────────────────

  // Actual schedules are complex — they reference rules for conditions/actions.
  // We extract what we can: frequency from rule conditions, next_date, amounts from json_paths.
  const scheduleRecords: Record<string, unknown>[] = [];

  for (const s of schedules) {
    const frequency = mapFrequency(s.conditions);

    // Try to extract amount from rule actions
    let amount = 0;
    let categoryId: string | null = null;
    let payeeId: string | null = null;
    let accountId: string | null = null;

    if (s.actions) {
      try {
        const actions = JSON.parse(s.actions);
        for (const action of actions) {
          if (action.field === 'amount' && action.value != null) {
            amount = (typeof action.value === 'number' ? action.value : 0) / 100;
          }
          if (action.field === 'category' && action.value) {
            categoryId = action.value;
          }
          if (action.field === 'payee' && action.value) {
            payeeId = action.value;
          }
          if (action.field === 'account' && action.value) {
            accountId = action.value;
          }
        }
      } catch {
        // Skip malformed actions
      }
    }

    // Need a valid account reference — skip if none found
    if (!accountId || !validAccountIds.has(accountId)) {
      // Try to find any account as fallback (first open account)
      if (accounts.length > 0) {
        accountId = accounts[0].id;
      } else {
        continue; // Can't create schedule without account
      }
    }

    const nextDate =
      actualDateToISO(s.local_next_date) ??
      actualDateToISO(s.base_next_date) ??
      new Date().toISOString();

    // Build a name from payee or a generic label
    let name = `Schedule ${s.id.slice(0, 8)}`;
    if (payeeId) {
      const payee = payees.find((p) => p.id === payeeId);
      if (payee?.name) name = payee.name;
    }

    scheduleRecords.push({
      id: makeRecordId('schedule', s.id),
      name,
      amount,
      account: makeRecordId('account', accountId),
      category:
        categoryId && validCategoryIds.has(categoryId)
          ? makeRecordId('category', categoryId)
          : null,
      payee:
        payeeId && validPayeeIds.has(payeeId)
          ? makeRecordId('payee', payeeId)
          : null,
      frequency,
      next_date: nextDate,
      active: s.active === 1 && s.completed === 0,
      created_at: new Date().toISOString(),
    });
  }

  counts.schedules = await batchInsert(
    surreal,
    'schedule',
    scheduleRecords,
    'Schedules',
  );

  // ── Verification ──────────────────────────────────────────────────────────

  console.log('');
  console.log('Verifying migration...');

  const verifyTable = async (
    table: string,
    expectedCount: number,
  ): Promise<{ table: string; expected: number; actual: number; match: boolean }> => {
    const [result] = await surreal.query<[{ count: number }[]]>(
      `SELECT count() AS count FROM type::table($table) GROUP ALL`,
      { table: new Table(table) },
    );
    const actualCount = result?.[0]?.count ?? 0;
    return {
      table,
      expected: expectedCount,
      actual: actualCount,
      match: actualCount === expectedCount,
    };
  };

  const totalCategories = counts.categoryGroups + counts.categories;

  const verifications = await Promise.all([
    verifyTable('account', counts.accounts),
    verifyTable('category', totalCategories),
    verifyTable('payee', counts.payees),
    verifyTable('transaction', counts.transactions),
    verifyTable('schedule', counts.schedules),
  ]);

  // Spot-check: total transaction amount
  const sqliteTotal = sqlite
    .prepare(
      `SELECT SUM(amount) as total FROM transactions WHERE tombstone = 0 AND acct IN (SELECT id FROM accounts WHERE tombstone = 0)`,
    )
    .get() as { total: number | null };

  const [surrealTotalResult] = await surreal.query<
    [{ total: number }[]]
  >('SELECT math::sum(amount) AS total FROM transaction GROUP ALL');
  const surrealTotal = surrealTotalResult?.[0]?.total ?? 0;
  const sqliteTotalDecimal = (sqliteTotal?.total ?? 0) / 100;
  const amountsMatch =
    Math.abs(sqliteTotalDecimal - surrealTotal) < 0.01;

  // ── Print Summary ─────────────────────────────────────────────────────────

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║           Migration Complete                    ║');
  console.log('╠══════════════════════════════════════════════════╣');

  for (const v of verifications) {
    const status = v.match ? 'OK' : 'MISMATCH';
    const indicator = v.match ? '[OK]' : '[!!]';
    console.log(
      `║  ${indicator} ${v.table.padEnd(14)} ${String(v.actual).padStart(6)} / ${String(v.expected).padStart(6)}  ${status.padStart(10)} ║`,
    );
  }

  console.log('╠══════════════════════════════════════════════════╣');
  console.log(
    `║  Amount check: SQLite ${sqliteTotalDecimal.toFixed(2).padStart(12)}    ║`,
  );
  console.log(
    `║                Surreal ${surrealTotal.toFixed(2).padStart(11)}    ║`,
  );
  console.log(
    `║                ${amountsMatch ? 'MATCH' : 'MISMATCH'}${' '.repeat(28)}║`,
  );
  console.log('╚══════════════════════════════════════════════════╝');

  const allMatch =
    verifications.every((v) => v.match) && amountsMatch;
  if (!allMatch) {
    console.log('');
    console.log(
      'WARNING: Some counts do not match. Please investigate.',
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  sqlite.close();
  await surreal.close();

  console.log('');
  console.log('Done.');
  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error('Migration failed with error:');
  console.error(err);
  process.exit(1);
});
