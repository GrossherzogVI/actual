# Finance OS Level-5 Runtime

This `apps/` tree is the ground-up Level-5 stack for the Finance OS command platform.

## Services

- `apps/web`: command-center frontend (React + Vite).
- `apps/gateway`: workflow/scenario/focus/delegate/policy/intelligence API plane (Fastify).
- `apps/sync`: Yjs fanout sync for non-ledger collaboration state.
- `apps/worker`: projection/anomaly/close/model background jobs.
- `apps/ai-policy`: sovereignty-first AI routing and egress audit plane.

## Persistence + Queue

`apps/gateway` supports dual-mode operation:

- `FINANCE_GATEWAY_STORE=memory`: in-memory repository (default).
- `FINANCE_GATEWAY_STORE=postgres` + `FINANCE_GATEWAY_DATABASE_URL=...`: PostgreSQL repository with schema bootstrap.

Queue semantics are also dual-mode:

- No `FINANCE_GATEWAY_REDIS_URL`: in-memory queue.
- With `FINANCE_GATEWAY_REDIS_URL`: Redis-backed queue (`LPUSH`/`RPOP`) for background jobs.

Internal queue-control APIs can be token-gated:

- `FINANCE_GATEWAY_INTERNAL_TOKEN=<secret>` on gateway to require `x-finance-internal-token`.
- Set the same token on worker (`FINANCE_GATEWAY_INTERNAL_TOKEN`) so claim/ack/requeue calls succeed.
- The same token is required for operational replay/health routes:
  - `/workflow/v1/replay-worker-dead-letters`
  - `/workflow/v1/resolve-worker-dead-letter`
  - `/workflow/v1/reopen-worker-dead-letter`
  - `/workflow/v1/worker-queue-health`
  - `/workflow/v1/acquire-worker-queue-lease`
  - `/workflow/v1/release-worker-queue-lease`

Worker lease/fencing env knobs:

- `QUEUE_LEASE_KEY` (default `worker-queue-drain`)
- `QUEUE_LEASE_TTL_MS` (default `15000`)

Ops maintenance now trims:

- `ops_activity_events`
- `worker_job_attempts`
- `worker_dead_letters`

using the same retention/max-row controls from gateway activity maintenance settings.

## Quick start

```bash
# install workspace deps after pulling these packages/apps
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs install

# run full Level-5 stack
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs start:level5
```

You can also run each service independently:

```bash
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs start:level5:web
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs start:level5:gateway
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs start:level5:sync
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs start:level5:worker
/usr/local/bin/node .yarn/releases/yarn-4.10.3.cjs start:level5:ai-policy
```

## Contract packages

- `packages/contracts/proto/*`: canonical API schemas for ledger/workflow/scenario/focus/delegate/policy/intelligence.
- `packages/domain-kernel`: command envelope + temporal and recommendation kernel.
- `packages/design-system`: command-center tokens, motion, and primitive surfaces.
- `packages/event-model`: immutable event-stream primitives.
