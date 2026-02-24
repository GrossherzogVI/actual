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

    await db.connect(url, {
      namespace: ns,
      database: dbName,
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
  return client.signin({
    namespace: 'finance',
    database: 'main',
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
