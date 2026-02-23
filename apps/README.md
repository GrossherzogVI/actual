# Finance OS Level-5 Runtime

This `apps/` tree is the ground-up Level-5 stack for the Finance OS command platform.

## Services

- `apps/web`: command-center frontend (React + Vite).
- `apps/gateway`: workflow/scenario/focus/delegate/policy/intelligence API plane (Fastify).
- `apps/sync`: Yjs fanout sync for non-ledger collaboration state.
- `apps/worker`: projection/anomaly/close/model background jobs.
- `apps/ai-policy`: sovereignty-first AI routing and egress audit plane.

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
