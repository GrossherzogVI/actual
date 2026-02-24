import Surreal from 'surrealdb';

const db = new Surreal();

// Promise-based connection guard prevents race conditions
let connectionPromise: Promise<Surreal> | null = null;
let isConnected = false;

export async function connect(): Promise<Surreal> {
  if (isConnected) return db;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const url = import.meta.env.VITE_SURREALDB_URL || 'ws://localhost:8000';
    const ns = import.meta.env.VITE_SURREALDB_NS || 'finance';
    const dbName = import.meta.env.VITE_SURREALDB_DB || 'main';

    // Build connect options — authentication baked in so reconnects re-auth automatically
    const user = import.meta.env.VITE_SURREALDB_USER;
    const pass = import.meta.env.VITE_SURREALDB_PASS;

    await db.connect(url, {
      namespace: ns,
      database: dbName,
      auth: user && pass ? { username: user, password: pass } : undefined,
      reconnect: {
        enabled: true,
        attempts: -1,
        retryDelay: 1000,
        retryDelayMax: 30000,
        retryDelayMultiplier: 2,
      },
    });

    isConnected = true;
    return db;
  })();

  try {
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null;
    isConnected = false;
    throw err;
  }
}

export async function signin(email: string, password: string) {
  const client = await connect();
  const ns = import.meta.env.VITE_SURREALDB_NS || 'finance';
  const dbName = import.meta.env.VITE_SURREALDB_DB || 'main';
  return client.signin({
    namespace: ns,
    database: dbName,
    access: 'account',
    variables: { email, password },
  });
}

export async function signout() {
  await db.invalidate();
  isConnected = false;
  connectionPromise = null;
}

export function getDb(): Surreal {
  return db;
}

export { db };
