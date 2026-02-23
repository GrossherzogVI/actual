import * as z from 'zod';

export const commandEnvelopeSchema = z.object({
  commandId: z.string().min(6),
  actorId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  intent: z.string().min(1),
  workflowId: z.string().min(1),
  sourceSurface: z.string().min(1),
  confidenceContext: z
    .object({
      score: z.number().min(0).max(1),
      rationale: z.string().min(1),
    })
    .optional(),
  latencyBudgetMs: z.number().int().min(1).max(30_000),
  clientTimestampMs: z.number().int().positive(),
});

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export function createCommandEnvelope(
  input: Omit<CommandEnvelope, 'clientTimestampMs' | 'latencyBudgetMs'> &
    Partial<Pick<CommandEnvelope, 'clientTimestampMs' | 'latencyBudgetMs'>>,
): CommandEnvelope {
  return commandEnvelopeSchema.parse({
    ...input,
    clientTimestampMs: input.clientTimestampMs ?? Date.now(),
    latencyBudgetMs: input.latencyBudgetMs ?? 500,
  });
}

export function assertCommandEnvelope(
  value: unknown,
): asserts value is CommandEnvelope {
  commandEnvelopeSchema.parse(value);
}
