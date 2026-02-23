import type { FastifyReply } from 'fastify';
import type { ZodTypeAny } from 'zod';
import * as z from 'zod';

function issuePath(issuePath: PropertyKey[]): string {
  if (!issuePath.length) return '(root)';
  return issuePath
    .map(segment => (typeof segment === 'symbol' ? segment.toString() : String(segment)))
    .join('.');
}

export function parseRequestBody<T extends ZodTypeAny>(
  schema: T,
  body: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }

  reply.code(400).send({
    error: 'invalid-request',
    details: parsed.error.issues.map(issue => ({
      path: issuePath(issue.path),
      message: issue.message,
    })),
  });

  return null;
}

export function sendNotFound(
  reply: FastifyReply,
  error: string,
): null {
  reply.code(404).send({
    error,
  });

  return null;
}

export function sendConflict(
  reply: FastifyReply,
  error: string,
): null {
  reply.code(409).send({
    error,
  });

  return null;
}

export function sendUnauthorized(
  reply: FastifyReply,
  error: string,
): null {
  reply.code(401).send({
    error,
  });

  return null;
}
