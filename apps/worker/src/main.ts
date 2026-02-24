import Surreal from 'surrealdb';

type WorkerConfig = {
  workerId: string;
  surrealUrl: string;
  surrealNs: string;
  surrealDb: string;
  surrealUser: string;
  surrealPass: string;
  ollamaUrl: string;
  projectionIntervalMs: number;
  anomalyIntervalMs: number;
  closeRoutineIntervalMs: number;
  queuePollIntervalMs: number;
  queueMaxJobs: number;
  queueMaxAttempts: number;
};

const config: WorkerConfig = {
  workerId:
    process.env.WORKER_ID ||
    `worker-${Math.random().toString(16).slice(2, 8)}`,
  surrealUrl: process.env.SURREALDB_URL || 'ws://localhost:8000',
  surrealNs: process.env.SURREALDB_NS || 'finance',
  surrealDb: process.env.SURREALDB_DB || 'main',
  surrealUser: process.env.SURREALDB_USER || 'root',
  surrealPass: process.env.SURREALDB_PASS || 'root',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  projectionIntervalMs: Number(process.env.PROJECTION_INTERVAL_MS || 30_000),
  anomalyIntervalMs: Number(process.env.ANOMALY_INTERVAL_MS || 60_000),
  closeRoutineIntervalMs: Number(
    process.env.CLOSE_ROUTINE_INTERVAL_MS || 60_000,
  ),
  queuePollIntervalMs: Number(process.env.QUEUE_POLL_INTERVAL_MS || 1_500),
  queueMaxJobs: Number(process.env.QUEUE_MAX_JOBS || 25),
  queueMaxAttempts: Number(process.env.QUEUE_MAX_ATTEMPTS || 6),
};

const db = new Surreal();

async function connectDb() {
  await db.connect(config.surrealUrl, {
    namespace: config.surrealNs,
    database: config.surrealDb,
  });
  await db.signin({
    username: config.surrealUser,
    password: config.surrealPass,
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Tasks ──────────────────────────────────────────────────────────────────

async function projectionTask() {
  const [pending] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM review_item WHERE status = 'pending' GROUP ALL`,
  );
  const [urgent] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM review_item WHERE priority = 'critical' AND status = 'pending' GROUP ALL`,
  );
  const [expiring] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM contract WHERE health = 'red' GROUP ALL`,
  );

  console.log(
    `[${nowIso()}][worker:projection] pending=${pending?.[0]?.count ?? 0} urgent=${urgent?.[0]?.count ?? 0} expiring=${expiring?.[0]?.count ?? 0}`,
  );
}

async function anomalyTask() {
  const [urgent] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM review_item WHERE priority = 'critical' AND status = 'pending' GROUP ALL`,
  );
  const [expiring] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM contract WHERE health = 'red' GROUP ALL`,
  );

  const urgentCount = urgent?.[0]?.count ?? 0;
  const expiringCount = expiring?.[0]?.count ?? 0;

  if (urgentCount > 5 || expiringCount > 10) {
    console.log(
      `[${nowIso()}][worker:anomaly] high-pressure urgent=${urgentCount} expiring=${expiringCount}`,
    );
  }
}

async function closeRoutineTask() {
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek !== 1) return; // Only on Mondays

  const [pending] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM review_item WHERE status = 'pending' GROUP ALL`,
  );
  const [expiring] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM contract WHERE health IN ['red', 'yellow'] GROUP ALL`,
  );

  console.log(
    `[${nowIso()}][worker:close] weekly summary pending=${pending?.[0]?.count ?? 0} expiring=${expiring?.[0]?.count ?? 0}`,
  );
}

// ── Queue ──────────────────────────────────────────────────────────────────

async function queueDrainTask() {
  // Atomically claim pending jobs
  const [jobs] = await db.query<
    [
      {
        id: string;
        name: string;
        payload: Record<string, unknown>;
        attempt: number;
      }[],
    ]
  >(
    `UPDATE (SELECT * FROM job_queue WHERE status = 'pending' AND visible_at <= time::now() LIMIT $limit) SET status = 'claimed', claimed_by = $worker, claimed_at = time::now() RETURN AFTER`,
    { limit: config.queueMaxJobs, worker: config.workerId },
  );

  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    const startedAtMs = Date.now();
    try {
      await processQueueJob(job);

      // Delete completed job
      await db.query('DELETE $id', { id: job.id });

      console.log(
        `[${nowIso()}][worker:queue] completed job=${job.name} ms=${Date.now() - startedAtMs}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRequeue = job.attempt < config.queueMaxAttempts;

      if (shouldRequeue) {
        const backoffMs = Math.min(60_000, 1000 * Math.pow(2, job.attempt));
        await db.query(
          `UPDATE $id SET status = 'pending', claimed_by = NONE, claimed_at = NONE, attempt = attempt + 1, visible_at = time::now() + $backoff, error_message = $error`,
          { id: job.id, backoff: `${backoffMs}ms`, error: message },
        );
      } else {
        await db.query(
          `UPDATE $id SET status = 'failed', error_message = $error`,
          { id: job.id, error: message },
        );
      }

      console.error(
        `[${nowIso()}][worker:queue] failed job=${job.name} attempt=${job.attempt} requeue=${shouldRequeue} error=${message}`,
      );
    }
  }
}

async function classifyTransaction(payload: Record<string, unknown>) {
  const txnId = String(payload.transaction_id ?? '');
  if (!txnId) return;

  // Fetch transaction with resolved names
  const [txns] = await db.query<[{ id: string; amount: number; notes?: string; payee_name?: string; category?: string; category_name?: string }[]]>(
    `SELECT *, payee.name AS payee_name, category.name AS category_name FROM $id`,
    { id: txnId },
  );
  const txn = txns?.[0];
  if (!txn) return;

  // Skip if already categorized
  if (txn.category) {
    console.log(`[worker:classify] skipping ${txnId} — already categorized as ${txn.category_name}`);
    return;
  }

  // Fetch all categories for the prompt
  const [cats] = await db.query<[{ id: string; name: string; parent?: string; is_income: boolean }[]]>(
    `SELECT id, name, parent, is_income FROM category ORDER BY sort_order`,
  );
  const categoryList = (cats ?? []).map(c => `${c.id}: ${c.name}${c.is_income ? ' (Einnahme)' : ''}`).join('\n');

  const prompt = `Du bist ein Finanz-Kategorisierer. Ordne die folgende Transaktion einer Kategorie zu.

Transaktion:
- Betrag: ${txn.amount} EUR
- Empfänger: ${txn.payee_name ?? 'Unbekannt'}
- Notizen: ${txn.notes ?? 'Keine'}

Verfügbare Kategorien:
${categoryList}

Antworte NUR mit der Kategorie-ID (z.B. "category:lebensmittel") und einem Konfidenzwert zwischen 0.0 und 1.0, getrennt durch ein Komma.
Beispiel: category:lebensmittel,0.92`;

  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'mistral-small',
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 50 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const result = await response.json() as { response: string };
    const [categoryId, confidenceStr] = result.response.trim().split(',');
    const confidence = parseFloat(confidenceStr?.trim() ?? '0');

    if (!categoryId || !categoryId.startsWith('category:')) {
      console.log(`[worker:classify] ${txnId} — could not parse response: ${result.response}`);
      await createReviewItem(txnId, 'uncategorized', 'medium', { raw_response: result.response });
      return;
    }

    if (confidence >= 0.85) {
      // High confidence: auto-categorize
      await db.query(
        `UPDATE $id SET category = $cat, ai_confidence = $conf, ai_classified = true, updated_at = time::now()`,
        { id: txnId, cat: categoryId.trim(), conf: confidence },
      );
      console.log(`[worker:classify] ${txnId} → ${categoryId.trim()} (${confidence}) — auto-applied`);
    } else {
      // Low confidence: create review item
      await db.query(
        `UPDATE $id SET ai_confidence = $conf, ai_classified = false, updated_at = time::now()`,
        { id: txnId, conf: confidence },
      );
      await createReviewItem(txnId, 'low-confidence', confidence < 0.5 ? 'high' : 'medium', {
        suggested_category: categoryId.trim(),
        confidence,
      });
      console.log(`[worker:classify] ${txnId} → review queue (confidence ${confidence})`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker:classify] Ollama error for ${txnId}: ${message}`);
    // Create review item for manual classification
    await createReviewItem(txnId, 'uncategorized', 'medium', { error: message });
  }
}

async function createReviewItem(
  transactionId: string,
  type: string,
  priority: string,
  suggestion: Record<string, unknown>,
) {
  await db.query(
    `CREATE review_item SET
      type = $type,
      transaction = $txn,
      priority = $priority,
      ai_suggestion = $suggestion,
      status = 'pending',
      created_at = time::now()`,
    { type, txn: transactionId, priority, suggestion },
  );
}

async function processQueueJob(job: {
  name: string;
  payload: Record<string, unknown>;
}) {
  switch (job.name) {
    case 'classify-transaction':
      await classifyTransaction(job.payload);
      break;
    case 'import-csv':
      // TODO: Parse CSV and insert transactions
      break;
    case 'check-deadlines': {
      const [expiring] = await db.query<
        [{ id: string; name: string }[]]
      >(
        `SELECT id, name FROM contract WHERE health = 'red' AND status = 'active'`,
      );
      for (const contract of expiring ?? []) {
        await db.query(
          `CREATE review_item SET type = 'contract-deadline', priority = 'high', ai_suggestion = { contract_id: $cid, contract_name: $cname, action: 'review-deadline' }, created_at = time::now()`,
          { cid: String(contract.id), cname: contract.name },
        );
      }
      break;
    }
    default:
      console.log(`[worker] unknown job: ${job.name}`);
  }
}

// ── Scheduling ─────────────────────────────────────────────────────────────

type WorkerTask = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

function scheduleTask(task: WorkerTask): NodeJS.Timeout {
  const runner = async () => {
    try {
      await task.run();
    } catch (err) {
      console.error(`[worker:${task.name}]`, err);
    }
  };

  void runner();
  return setInterval(() => {
    void runner();
  }, task.intervalMs);
}

async function main() {
  await connectDb();
  console.log(`[worker] connected to SurrealDB at ${config.surrealUrl}`);

  const tasks: WorkerTask[] = [
    {
      name: 'queue-drain',
      intervalMs: config.queuePollIntervalMs,
      run: queueDrainTask,
    },
    {
      name: 'projection',
      intervalMs: config.projectionIntervalMs,
      run: projectionTask,
    },
    {
      name: 'anomaly',
      intervalMs: config.anomalyIntervalMs,
      run: anomalyTask,
    },
    {
      name: 'close-routine',
      intervalMs: config.closeRoutineIntervalMs,
      run: closeRoutineTask,
    },
  ];

  const intervals = tasks.map(scheduleTask);

  const shutdown = async () => {
    for (const interval of intervals) clearInterval(interval);
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[worker] started', { workerId: config.workerId });
}

void main();
