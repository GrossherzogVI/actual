# Finance OS — Documentation Index

**Generated:** 2026-02-26 | **Scan:** Exhaustive | **Platform:** Level-5 (SurrealDB 3.0 + React 19)

> **AI Agent Note:** The ONLY active platform is `apps/web/` + `apps/worker/` + `schema/`. Legacy packages (`packages/sync-server/`, `packages/loot-core/`) and the archived `desktop-client-archive` branch are NOT the target for new development.

---

## Project Overview

| Property | Value |
|----------|-------|
| Type | Monorepo (3 active Level-5 parts) |
| Primary Language | TypeScript |
| Architecture | Feature-sliced SPA + queue-based worker + SurrealDB |
| Database | SurrealDB 3.0 (WebSocket, SCHEMAFULL, computed fields) |
| AI | Ollama (mistral-small + llama3.2-vision, self-hosted) |
| Deployment | Docker Compose, VPS (212.69.84.228), GitHub Actions CI/CD |

---

## Quick Reference by Part

### `web` — `apps/web/` (`@finance-os/web`)
- **Entry:** `index.html` → `src/main.tsx` → `src/app/App.tsx` → `src/features/finance/FinancePage.tsx`
- **Stack:** React 19 + Vite 7 + Tailwind v4 + Radix UI + TanStack Query + ECharts
- **Dev:** `yarn workspace @finance-os/web dev` → `http://localhost:5173`
- **Data layer:** `src/core/api/finance-api.ts` (35+ SurrealQL functions) + `src/core/types/finance.ts` (20+ types)

### `worker` — `apps/worker/` (`@finance-os/worker`)
- **Entry:** `src/main.ts`
- **Stack:** Node.js ESM + tsx + SurrealDB SDK + Ollama HTTP + Tesseract.js
- **Dev:** `yarn workspace @finance-os/worker dev`
- **Jobs:** classify-transaction, import-csv, ocr-receipt, detect-anomalies, analyze-spending-patterns, explain-classification

### `schema` — `schema/`
- **Entry:** `apply.sh` (loads 14 `.surql` files in order)
- **Tables:** 15 tables across financial core, contracts, intelligence, platform
- **Apply:** `cd schema && ./apply.sh`

---

## Generated Documentation

### Project-Wide
- [Project Overview](./project-overview.md) — Vision, tech stack, feature inventory, what's not built
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory tree, critical paths, entry points
- [Data Models](./data-models.md) — All 15 SurrealDB tables, fields, types, computed fields, indexes
- [Integration Architecture](./integration-architecture.md) — How web/worker/schema communicate, data flow examples
- [Development Guide](./development-guide.md) — Setup, commands, adding features/jobs, code style, testing
- [Deployment Guide](./deployment-guide.md) — CI/CD pipeline, VPS setup, Docker Compose, backup, rollback

### Per Part: Architecture
- [Architecture: Web](./architecture-web.md) — Pattern, tech decisions, data flow, component structure, testing
- [Architecture: Worker](./architecture-worker.md) — Job queue, scheduled tasks, reliability design, all job types
- [Architecture: Schema](./architecture-schema.md) — SurrealQL patterns, schema files, computed fields, apply process

### Detailed References
- [API Contracts: Web](./api-contracts-web.md) — All 35+ finance-api.ts functions with signatures and behavior
- [Component Inventory: Web](./component-inventory-web.md) — All 70+ React components organized by feature module

---

## Existing Documentation (Pre-BMAD)

| Document | Description |
|----------|-------------|
| [CLAUDE.md](../CLAUDE.md) | **Canonical project reference** — architecture, code style, quick start, feature inventory |
| [REQUIREMENTS.md](../REQUIREMENTS.md) | Product requirements and vision |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | High-level architecture notes |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines |
| [docs/plans/2026-02-22-payment-deadlines-design.md](./plans/2026-02-22-payment-deadlines-design.md) | Payment deadline feature design |

---

## Getting Started for AI Agents

**Starting a new feature:**
1. Read [CLAUDE.md](../CLAUDE.md) for code conventions
2. Read [Source Tree Analysis](./source-tree-analysis.md) for structure
3. Read [API Contracts](./api-contracts-web.md) to understand existing data access
4. Read [Data Models](./data-models.md) if touching SurrealDB schema
5. Read [Development Guide](./development-guide.md) for the "Adding a Feature Module" recipe

**Debugging an issue:**
1. Read [Integration Architecture](./integration-architecture.md) — "Known Issues" section
2. Check worker logs for job queue errors
3. Verify SurrealDB schema via `schema/*.surql`

**Planning a new phase:**
1. Read [Project Overview](./project-overview.md) — "What Is NOT Yet Built" section
2. Read `planning-artifacts/workflow-status.yaml` for current sprint state
3. Check `REQUIREMENTS.md` for product direction

---

## BMAD Project Files

| File | Purpose |
|------|---------|
| [bmad/config.yaml](../bmad/config.yaml) | Project configuration (name, level, tech stack) |
| [planning-artifacts/workflow-status.yaml](../planning-artifacts/workflow-status.yaml) | Phase completion tracking |
| [implementation-artifacts/stories/](../implementation-artifacts/stories/) | Story files for sprint implementation |
