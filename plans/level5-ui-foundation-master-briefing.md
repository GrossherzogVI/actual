# Finance OS Level-5 UI Foundation — Master Briefing Pack

## 1. Intent

Build a **precision command platform** with enterprise-grade clarity, speed, and confidence.  
Design target is not “clean dashboard.” It is “high-trust financial operations cockpit” with Notion/Linear-grade feel and stronger data density.

## 2. Current Baseline Snapshot

### 2.1 What is already strong

1. Core three-zone shell already exists in `/Users/admin/dev/actual-budget/apps/web/src/app/App.tsx`:
1. Left: close + narrative.
1. Center: command mesh + playbooks + spatial twin + decision graph.
1. Right: adaptive focus + ops activity + runtime + delegate + policy.
1. Strong feature coverage already exists across `/Users/admin/dev/actual-budget/apps/web/src/features/*`.
1. Typography and semantic ambition are already present in `/Users/admin/dev/actual-budget/apps/web/src/styles/global.css` and `/Users/admin/dev/actual-budget/packages/design-system/src/tokens/command-center.ts`.

### 2.2 What is still below Level-5

1. Visual language is still “good custom CSS” instead of “fully governed design system.”
1. Components are mostly panel-specific and not standardized into reusable primitives with strict variants.
1. Interaction affordances exist, but keyboard discoverability and command-state continuity are inconsistent.
1. Status semantics, density tuning, and information hierarchy are not yet globally codified.
1. Some surfaces still feel utility-grade, not premium product-grade.

## 3. Level-5 Design Doctrine (Canonical)

### 3.1 Product feel

1. Tone: **Precision Industrial Editorial**.
1. Mood: dense calm, low-noise, high-confidence.
1. Cognitive model: “always in context, never reset.”

### 3.2 Visual language

1. Typography stack:
1. UI labels/navigation: `Public Sans`.
1. Dense operational text: `IBM Plex Sans`.
1. Numeric/command/status strings: `JetBrains Mono`.
1. Layout grammar:
1. Persistent command rail (left nav context).
1. Operating canvas (primary center flow).
1. Adaptive strip (right, next-best actions + telemetry).
1. Color semantics:
1. Neutral base for calm.
1. Exactly three status channels: urgency, opportunity, confidence.
1. No random accent colors per feature.
1. Motion:
1. Utility-only motion windows: 120ms, 180ms, 220ms.
1. No decorative motion.
1. `prefers-reduced-motion` parity at all times.

### 3.3 Interaction grammar

1. Keyboard-first, pointer-second.
1. All high-frequency actions command-complete.
1. Every operation provides:
1. immediate feedback,
1. reversible path,
1. visible status update.
1. Overlays and drawers preserve context; avoid hard route swaps.
1. Batch actions are first-class, not an afterthought.

### 3.4 Data density rules

1. Prefer scannable cards/rows with 3-5 high-value fields.
1. Use compact badges and bars for signal, never verbose paragraphs.
1. Avoid dead whitespace unless it improves decision speed.
1. Default to exception-first sorting (risk first, then recency).

## 4. Design System Architecture (Target)

### 4.1 Packages

1. Keep tokens in `/Users/admin/dev/actual-budget/packages/design-system/src/tokens/`.
1. Add:
1. `semantic.ts` (status + state tokens),
1. `layout.ts` (grid, spacing, panel metrics),
1. `elevation.ts` (surface layering and depth),
1. `typography.ts` (explicit type scale + line heights).

### 4.2 Primitive taxonomy

1. Foundation primitives:
1. Surface, Stack, Inline, Divider, ScrollArea.
1. Interactive primitives:
1. Button, IconButton, Field, Select, Checkbox, Toggle, Tooltip, Menu.
1. Operational primitives:
1. StatusBadge, RiskPill, SignalBar, MetricCard, TimelineItem, CommandChip.
1. Composite patterns:
1. CommandBar,
1. TriageLane,
1. MissionBoard,
1. RuntimeIncidentRail,
1. ScenarioCompareHUD,
1. AdaptiveActionWorkbench.

### 4.3 State + variant contract

1. Every primitive uses explicit variants:
1. `size`: xs/sm/md/lg,
1. `tone`: neutral/info/warn/danger/success,
1. `density`: compact/comfortable.
1. No ad-hoc per-panel CSS overrides unless documented.

## 5. shadcn/Radix Strategy (Recommended)

### 5.1 Why use it

1. Accelerates accessibility and behavior correctness.
1. Reduces maintenance burden on base interactive components.
1. Lets custom visual language sit on a proven interaction foundation.

### 5.2 How to use it without becoming generic

1. Use shadcn for behavior primitives only.
1. Replace default visual tokens with Finance OS token contract.
1. Remove default “Tailwind demo aesthetics.”
1. Enforce custom class recipes per component family.

### 5.3 Suggested initial shadcn set

1. `button`, `input`, `textarea`, `select`, `checkbox`, `switch`, `tabs`.
1. `dialog`, `drawer`, `popover`, `dropdown-menu`, `tooltip`.
1. `command`, `scroll-area`, `separator`, `badge`, `table`.

### 5.4 Integration sequence

1. Create token bridge from `packages/design-system` into app theme.
1. Replace low-level controls in highest-traffic panels first:
1. `/Users/admin/dev/actual-budget/apps/web/src/features/command-mesh/CommandMeshPanel.tsx`
1. `/Users/admin/dev/actual-budget/apps/web/src/features/adaptive-focus/AdaptiveFocusRail.tsx`
1. `/Users/admin/dev/actual-budget/apps/web/src/features/delegate-lanes/DelegateLanesPanel.tsx`
1. `/Users/admin/dev/actual-budget/apps/web/src/features/close-loop/CloseLoopPanel.tsx`
1. Migrate panel-by-panel, not all at once.

## 6. UX Hard Criteria (Definition of Done)

1. 90%+ high-frequency actions keyboard-complete.
1. Open-to-first-commit median <= 45s.
1. Repeat capture <= 3s median.
1. Triage throughput >= 15 items / <= 2 min.
1. Every async action has:
1. pending state,
1. success state,
1. failure state,
1. retry path.
1. No visual ambiguity for risk, confidence, or automation status.
1. No critical blank states.

## 7. High-Impact Design Tasks to Outsource in Parallel

### 7.1 Task A: Design token hardening

1. Deliver semantic token map with dark/light-ready structure.
1. Include contrast matrix for all status combinations.
1. Include density scale for compact vs comfortable.

### 7.2 Task B: Component library productionization

1. Build variant matrix for all primitives.
1. Provide Storybook stories with interaction states.
1. Include accessibility notes per component.

### 7.3 Task C: Signature surfaces

1. Re-design these as polished, benchmark-quality flows:
1. Command Mesh composer + history.
1. Adaptive Focus workbench.
1. Delegate Mission board.
1. Runtime Incident timeline.
1. Spatial Twin compare HUD.

### 7.4 Task D: Interaction QA

1. Keyboard path audit for six loops.
1. Reduced-motion parity audit.
1. Responsive audit at 320/768/1024/1440.

## 8. Anti-Patterns to Ban

1. Generic SaaS gradients and template-like cards.
1. Color-only meaning without text/badge backup.
1. Action buttons without confidence/risk context.
1. Route-reset workflows that destroy context.
1. “Invisible loading” (no pending indicators).
1. Mixed typographic voice across panels.

## 9. Gemini Hand-Off Prompt (Copy/Paste)

You are the principal product designer and frontend architect for Finance OS.  
Your task is to transform an already functional Level-5 feature set into a **benchmark-grade premium command platform**.  
Do not deliver generic dashboard output.

### Context

1. Repo root: `/Users/admin/dev/actual-budget`
1. Primary app: `/Users/admin/dev/actual-budget/apps/web`
1. Existing shell and feature surfaces are implemented in:
1. `/Users/admin/dev/actual-budget/apps/web/src/app/App.tsx`
1. `/Users/admin/dev/actual-budget/apps/web/src/features/*`
1. Current styling baseline: `/Users/admin/dev/actual-budget/apps/web/src/styles/global.css`
1. Existing design-system baseline:
1. `/Users/admin/dev/actual-budget/packages/design-system/src/tokens/command-center.ts`
1. `/Users/admin/dev/actual-budget/packages/design-system/src/primitives/*`

### Product posture (non-negotiable)

1. Precision Command Center.
1. Ops Superhuman primary route.
1. Spatial Finance Twin secondary differentiator.
1. Keyboard-first professional workflow.
1. Sovereignty-first trust posture.

### Deliverables

1. Produce a complete **design foundation refactor plan** and implement it:
1. hardened token architecture,
1. primitive component contract with variants,
1. visual hierarchy system for all operational panels,
1. interaction guidelines and keyboard affordance model,
1. motion and reduced-motion spec.
1. Refine these feature surfaces to premium quality:
1. Command Mesh,
1. Adaptive Focus,
1. Delegate Lanes,
1. Close Loop,
1. Runtime Incident Timeline,
1. Spatial Twin.
1. Implement with strict quality:
1. no placeholders,
1. no TODOs,
1. no throwaway styles,
1. no dead controls.

### UX quality gates

1. Every action exposes pending/success/failure.
1. Batch workflows are visibly first-class.
1. Risk/confidence semantics are unambiguous.
1. Panel transitions preserve context.
1. Keyboard discoverability is embedded in the UI.

### Constraints

1. Do not simplify features away.
1. Do not regress operational density.
1. Do not output generic shadcn aesthetics.
1. If you use shadcn primitives, fully reskin using Finance OS token semantics.

### Output format required

1. `Design Foundation Spec`
1. `Component Contract Matrix`
1. `Surface-by-Surface Before/After Rationale`
1. `Implementation Diff Plan`
1. `Acceptance Checklist`

## 10. Optional Prompt for External UI Partner

Create a visual and interaction specification for a high-density financial operations cockpit.  
Brand tone: precision industrial editorial, confident and calm.  
Primary references: Notion-level continuity + Linear-level speed + Bloomberg-like signal clarity.  
Deliver a design token system, component library spec, and surface mocks for command mesh, triage lanes, runtime incident rail, delegate mission board, and scenario twin HUD.  
The solution must be keyboard-first, reduced-motion compatible, and optimized for high-throughput professional workflows.
