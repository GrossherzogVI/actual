export type LedgerCursor = {
  occurredAtMs: number;
  streamPosition: number;
};

const CURSOR_PATTERN = /^(-?\d+):(\d+)$/;

export function encodeLedgerCursor(cursor: LedgerCursor): string {
  return `${cursor.occurredAtMs}:${cursor.streamPosition}`;
}

export function decodeLedgerCursor(value?: string): LedgerCursor | null {
  if (!value) return null;

  const match = value.match(CURSOR_PATTERN);
  if (!match) return null;

  const occurredAtMs = Number(match[1]);
  const streamPosition = Number(match[2]);

  if (
    !Number.isFinite(occurredAtMs) ||
    !Number.isFinite(streamPosition) ||
    streamPosition <= 0
  ) {
    return null;
  }

  return {
    occurredAtMs,
    streamPosition,
  };
}
