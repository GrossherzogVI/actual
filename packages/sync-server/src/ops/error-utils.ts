export function safeError(err: unknown, context = 'ops'): string {
  if (err instanceof Error) {
    console.error(`[${context}]`, err.message);
  }
  return 'internal-error';
}
