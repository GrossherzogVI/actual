import {
  commandEnvelopeSchema,
  type CommandEnvelope,
} from '@finance-os/domain-kernel';

export function parseCommandEnvelope(value: unknown): CommandEnvelope {
  return commandEnvelopeSchema.parse(value);
}

export function hasCommandEnvelope(
  schema: { shape?: Record<string, unknown> } | unknown,
): boolean {
  if (!schema || typeof schema !== 'object') return false;

  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) return false;

  return Object.prototype.hasOwnProperty.call(shape, 'envelope');
}
