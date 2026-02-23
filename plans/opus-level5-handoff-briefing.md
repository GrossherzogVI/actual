# Finance OS Level-5 Handoff Briefing (for Opus)

Updated: 2026-02-23
Repo: `/Users/admin/dev/actual-budget`
Branch: `master`
Working tree: clean

## 1) Vision I Was Driving

### North Star
Build a **precision finance command platform** (not a budgeting dashboard):
1. Keyboard-first, low-latency operations.
2. Explainable automation with reversible live execution.
3. Command mesh + playbooks + scenario simulation + delegate lanes + policy governance in one coherent operating loop.
4. Sovereignty-first AI with explicit policy/audit controls.

### Product posture
1. `Ops Superhuman` as primary differentiator.
2. `Spatial Finance Twin` as secondary differentiator.
3. High-throughput flows over generic dashboard aesthetics.

## 2) What I Wanted To Do Next (before handoff)

1. Finish reliability hardening after the UI overhaul.
2. Lock end-to-end run provenance and run-details interoperability.
3. Push Decision Graph + Adaptive Focus + Temporal lanes into one consistent execution model.
4. Stabilize service quality gates (typecheck/tests/contracts) to green before next feature wave.
5. Then proceed to observability/perf and launch hardening.

## 3) What Is Already Built (high-confidence)

## 3.1 Platform architecture
1. New Level-5 stack exists under `apps/`:
- `/Users/admin/dev/actual-budget/apps/web`
- `/Users/admin/dev/actual-budget/apps/gateway`
- `/Users/admin/dev/actual-budget/apps/sync`
- `/Users/admin/dev/actual-budget/apps/worker`
- `/Users/admin/dev/actual-budget/apps/ai-policy`

2. Canonical contract surfaces exist under:
- `/Users/admin/dev/actual-budget/packages/contracts/proto/*`

3. Domain kernel exists under:
- `/Users/admin/dev/actual-budget/packages/domain-kernel/src/*`

## 3.2 Ops Autopilot core (Wave 1) is materially implemented
1. Execution modes + guardrail profiles + status lifecycle in workflow proto:
- `/Users/admin/dev/actual-budget/packages/contracts/proto/workflow/v1/workflow.proto`

2. Gateway supports:
- run-playbook
- execute-chain
- rollback-playbook-run
- rollback-command-run
- list-command-runs-by-ids
in:
- `/Users/admin/dev/actual-budget/apps/gateway/src/workflow/routes.ts`

3. Service pipeline includes idempotency, guardrails, status transitions, rollback handling, queue events in:
- `/Users/admin/dev/actual-budget/apps/gateway/src/services/gateway-service.ts`

4. Repository support exists for Postgres + in-memory parity:
- `/Users/admin/dev/actual-budget/apps/gateway/src/repositories/postgres-repository.ts`
- `/Users/admin/dev/actual-budget/apps/gateway/src/repositories/in-memory-repository.ts`
- `/Users/admin/dev/actual-budget/apps/gateway/src/repositories/postgres-migrations.ts`

## 3.3 Runtime + provenance integration completed
1. Explicit command-run hydration by IDs:
- API client method and gateway route live.
2. Spatial Twin can open exact run details in Command Mesh context.
3. Run-details command event supports exact `runId` targeting.

Key files:
- `/Users/admin/dev/actual-budget/apps/web/src/core/api/client.ts`
- `/Users/admin/dev/actual-budget/apps/web/src/features/runtime/run-details-commands.ts`
- `/Users/admin/dev/actual-budget/apps/web/src/features/spatial-twin/SpatialTwinPanel.tsx`
- `/Users/admin/dev/actual-budget/apps/web/src/features/command-mesh/CommandMeshPanel.tsx`

## 3.4 UI integration status
1. Opus/Gemini-style shadcn + Tailwind v4 migration is already merged (multiple commits).
2. Design-system + primitives exist, but runtime/web reliability regressed (details in blockers).

## 4) Verified Status Snapshot (just executed)

## 4.1 Passing
1. Gateway tests:
- Command: `yarn workspace @finance-os/gateway test`
- Result: `76 passed, 1 skipped`.

2. Gateway typecheck:
- Command: `yarn workspace @finance-os/gateway typecheck`
- Result: pass.

3. Domain-kernel tests:
- Command: `yarn workspace @finance-os/domain-kernel test`
- Result: `10 passed`.

4. Domain-kernel typecheck:
- Command: `yarn workspace @finance-os/domain-kernel typecheck`
- Result: pass.

5. Sync/Worker/AI-policy typechecks:
- `yarn workspace @finance-os/sync typecheck`
- `yarn workspace @finance-os/worker typecheck`
- `yarn workspace @finance-os/ai-policy typecheck`
- Result: all pass.

## 4.2 Failing (current primary blocker)
1. Web typecheck fails with many `Cannot find name 't'` errors.
2. Web tests fail largely because affected panels throw at runtime (`t` undefined).

Commands and results:
1. `yarn workspace @finance-os/web typecheck`
- Fails with TS2304 on multiple files.

2. `yarn workspace @finance-os/web test`
- `25 failed, 3 passed`.
- Primary root cause: translation function `t` used without hook wiring.

## 4.3 Affected files (known)
These files call `t(...)` but currently do not wire `useTranslation`:
1. `/Users/admin/dev/actual-budget/apps/web/src/features/policy/PolicyControlPanel.tsx`
2. `/Users/admin/dev/actual-budget/apps/web/src/features/temporal-intelligence/TemporalIntelligencePanel.tsx`
3. `/Users/admin/dev/actual-budget/apps/web/src/features/ops-activity/OpsActivityFeedPanel.tsx`
4. `/Users/admin/dev/actual-budget/apps/web/src/features/delegate-lanes/DelegateLanesPanel.tsx`
5. `/Users/admin/dev/actual-budget/apps/web/src/features/runtime/RuntimeIncidentTimelinePanel.tsx`
6. `/Users/admin/dev/actual-budget/apps/web/src/features/decision-graph/DecisionGraphPanel.tsx`
7. `/Users/admin/dev/actual-budget/apps/web/src/features/spatial-twin/SpatialTwinPanel.tsx`
8. `/Users/admin/dev/actual-budget/apps/web/src/features/runtime/RunDetailsDrawer.tsx`
9. `/Users/admin/dev/actual-budget/apps/web/src/features/command-mesh/CommandMeshPanel.tsx`
10. `/Users/admin/dev/actual-budget/apps/web/src/features/close-loop/CloseLoopPanel.tsx`
11. `/Users/admin/dev/actual-budget/apps/web/src/features/adaptive-focus/AdaptiveFocusRail.tsx`
12. `/Users/admin/dev/actual-budget/apps/web/src/features/runtime/RuntimeControlPanel.tsx`
13. `/Users/admin/dev/actual-budget/apps/web/src/features/ops-playbooks/PlaybooksPanel.tsx`

## 5) Shortsighted Assumptions / Unused Potential (critical review)

1. UI migration optimized for visual momentum but underweighted compile/runtime safety.
- Symptom: high-impact runtime break (`t` undefined) across many core panels.

2. Documentation drift is now severe.
- `CLAUDE.md`, `ARCHITECTURE.md`, and `REQUIREMENTS.md` still describe substantial legacy context (`packages/desktop-client`, handler bridge model) while `apps/*` is now the strategic core.
- This creates onboarding and execution risk for any new contributor/agent.

3. Service maturity is uneven.
- Gateway is comparatively hardened (tests/contracts/repositories).
- Sync/Worker/AI-policy are operational but have light/no test coverage and thin failure-mode validation.

4. Observability is not at Level-5 yet.
- No visible OTel/Prom/Loki/Grafana integration in code paths.
- Runtime and queue reliability features exist, but not full metrics/tracing posture.

5. Contract-to-UI invariants need tighter gating.
- Proto + route contract coverage exists, but no full e2e matrix validating shell loops with live/dry-run + rollback + provenance navigation after UI changes.

## 6) What Is Still Outstanding

## 6.1 Immediate (must do now)
1. Restore web compile/runtime integrity by fixing translation hook wiring in all impacted panels.
2. Re-run web tests and close failures until green.
3. Ensure no regressions in run-details, rollback, simulation flows.

## 6.2 Near-term (next)
1. Add reliability tests for worker/sync/ai-policy (at least smoke + contract-ish behavior checks).
2. Add integration tests for command envelope validation across critical entrypoints.
3. Standardize run status rendering semantics across all surfaces.

## 6.3 Mid-term
1. Full observability pass (metrics/traces/log correlation).
2. Perf pass for high-density panels and query patterns.
3. Production hardening and runbooks for queue dead-letter operations and AI policy failures.

## 6.4 Product/UX completion
1. Ensure six operating loops are fully keyboard-complete and measurable.
2. Add measurable UX telemetry for open-to-first-commit, triage throughput, rollback usage, recommendation adoption.
3. Final consistency pass for design semantics, status language, and action outcome clarity.

## 7) Recommended Execution Plan For Opus

## Phase 0: Stabilize (today)
1. Fix all `t` hook wiring issues across affected panels.
2. Run:
- `yarn workspace @finance-os/web typecheck`
- `yarn workspace @finance-os/web test`
3. Do not start new feature work until both are green.

## Phase 1: Guarded feature continuity (immediately after green)
1. Re-verify core loops with test coverage:
- command mesh execute + rollback
- playbook execute + rollback
- spatial twin promote + provenance + run details open
- adaptive focus action execution
- temporal intelligence chain execution

2. Add one end-to-end regression harness for run lifecycle:
- planned -> running -> terminal/blocked -> rollback states.

## Phase 2: Service hardening
1. Add tests for:
- `apps/worker/src/main.ts` queue claim/ack/requeue behaviors.
- `apps/sync/src/main.ts` room fanout correctness and disconnect behavior.
- `apps/ai-policy/src/main.ts` route/policy/audit invariants.

2. Validate internal token gating and lease/fencing behavior under contention.

## Phase 3: Documentation convergence
1. Create a canonical Level-5 architecture doc for `apps/*` and mark legacy docs as historical.
2. Update onboarding and runbook docs with exact dev/test commands.
3. Keep one source of truth for APIs: proto + registry + HTTP shape examples.

## Phase 4: Level-5 polish and launch readiness
1. Observability instrumentation + dashboards.
2. Performance tuning and budget thresholds for key interactions.
3. Final UX quality gates and telemetry-backed acceptance.

## 8) Tactical Recommendations To Opus

1. Treat current state as a **stability-first checkpoint**, not a feature sprint base.
2. First PR should be a pure reliability PR (translation hook fixes + test green).
3. Second PR should strengthen worker/sync/ai-policy test coverage.
4. Only then proceed with new UX/feature expansion.
5. Avoid touching legacy `packages/desktop-client` unless explicitly required.
6. Keep changes small and isolated per pillar to avoid another cross-surface break.

## 9) Fast command checklist for Opus

1. Baseline checks:
- `yarn workspace @finance-os/gateway test`
- `yarn workspace @finance-os/gateway typecheck`
- `yarn workspace @finance-os/web typecheck`
- `yarn workspace @finance-os/web test`

2. Extended checks:
- `yarn workspace @finance-os/domain-kernel test`
- `yarn workspace @finance-os/domain-kernel typecheck`
- `yarn workspace @finance-os/sync typecheck`
- `yarn workspace @finance-os/worker typecheck`
- `yarn workspace @finance-os/ai-policy typecheck`

## 10) Final handoff note

If Opus has already integrated UI, the fastest path to momentum is:
1. Repair translation hook wiring.
2. Return web suite to green.
3. Lock reliability.
4. Resume feature/polish waves on top of a stable base.

That sequence preserves speed without compounding risk.
