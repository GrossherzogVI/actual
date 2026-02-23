# Actual Budget++ UI Overhaul Briefing

## Mission

Systematically overhaul **every** UI component and page in this personal finance app ("Finance OS") to use **shadcn/ui components** with our custom **ActualBudget_Blue** theme (tweakcn). The goal: transform the current mix of `@emotion/css` inline styles and `@actual-app/components` primitives into a cohesive, modern, premium-feeling interface using Tailwind CSS + shadcn/ui.

## Important: Use the shadcn MCP

You have access to the **shadcn MCP server**. Use it to:
- Browse and search for additional components as needed
- Install new shadcn components directly (e.g., `sidebar`, `navigation-menu`, `chart`, `form`, `data-table`)
- Check available shadcn blocks for pre-built layouts

If you need a component that isn't installed yet, use the MCP to add it. Don't build custom components when shadcn has one.

## Design System

### Theme: ActualBudget_Blue (tweakcn)

The theme is fully configured in `packages/desktop-client/src/globals.css`. Key tokens:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--primary` | Blue `oklch(0.5461 0.2152 262.88)` | Lighter blue `oklch(0.6231 0.1880 259.81)` | Primary actions, active states, links |
| `--background` | Off-white `oklch(0.9842 0.0034 247.86)` | Deep navy `oklch(0.1288 0.0406 264.70)` | Page backgrounds |
| `--card` | Pure white | Dark card `oklch(0.2077 0.0398 265.75)` | Cards, panels, widgets |
| `--muted` | Light gray | Dark gray `oklch(0.2795)` | Subtle backgrounds, disabled states |
| `--destructive` | Red | Dark red | Delete, errors, overdraft warnings |
| `--sidebar-*` | Dedicated sidebar tokens | Dedicated sidebar tokens | Sidebar navigation |
| `--chart-1..5` | 5-color palette | 5-color palette (different) | All chart visualizations |

Font: Inter (sans), JetBrains Mono (mono), Georgia (serif). Tight letter-spacing (-0.01em light, -0.02em dark).

### Utility Function

```tsx
import { cn } from '@/lib/utils';

// Merge Tailwind classes with conflict resolution
<div className={cn("bg-card text-card-foreground rounded-lg p-4", isActive && "border-primary")} />
```

### Import Path Convention

All shadcn components live at `@/components/ui/`:
```tsx
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
```

## Installed shadcn Components (25)

```
accordion    alert       avatar      badge       button
card         checkbox    command     dialog      dropdown-menu
input        label       popover     progress    scroll-area
select       separator   sheet       skeleton    sonner
switch       table       tabs        textarea    tooltip
```

Install more as needed via the MCP. Likely candidates:
- `sidebar` — for the main navigation overhaul
- `navigation-menu` — for top-level nav if needed
- `form` — for structured form layouts with validation
- `chart` — shadcn's recharts wrapper with theme integration
- `data-table` — for transaction lists, contract tables
- `breadcrumb` — page hierarchy
- `calendar` — date picking
- `collapsible` — expandable sections
- `toggle` / `toggle-group` — for view mode switches
- `alert-dialog` — for destructive confirmations
- `aspect-ratio`, `hover-card`, `menubar`, `radio-group`, `slider`, `resizable`

## Project Structure

```
packages/desktop-client/
  src/
    components/
      ui/              <-- shadcn components (Tailwind + cn())
      sidebar/         <-- Main navigation sidebar
      dashboard/       <-- Dashboard page + 9 widgets
      contracts/       <-- Contract list + detail page
      calendar/        <-- Payment calendar
      analytics/       <-- Analytics with 6 chart tabs
      quick-add/       <-- Quick Add overlay (Cmd+N)
      review/          <-- AI review queue
      import/          <-- Import wizard
      tags/            <-- Tag management
      settings/        <-- Settings pages
      accounts/        <-- Account list + transaction views
      budget/          <-- Budget editor (upstream)
      reports/         <-- Report pages (upstream)
      transactions/    <-- Transaction list (upstream)
      modals/          <-- Modal registry
      common/          <-- Shared components (Toast, Search, etc.)
      filters/         <-- Filter bar components
    style/             <-- Legacy theme tokens (@emotion/css)
    lib/
      utils.ts         <-- cn() helper
    globals.css        <-- Tailwind theme (ActualBudget_Blue)
```

## What to Overhaul

### Phase 1: Foundation & Layout Shell

1. **Sidebar (`components/sidebar/`)** — Replace custom sidebar with shadcn `sidebar` component. Use `--sidebar-*` theme tokens. Navigation items: Dashboard, Konten, Budget, Kalender, Vertraege, Analytics, Berichte, Review, Einstellungen.

2. **App Shell (`components/FinancesApp.tsx`)** — Restructure the main layout to use shadcn sidebar + content area pattern. Add `TooltipProvider` and `Toaster` (sonner) at app root.

3. **Page Headers** — Every page should have a consistent header pattern using shadcn components: title, description, action buttons, breadcrumbs.

### Phase 2: Custom Pages (Finance OS features)

4. **Dashboard (`components/dashboard/`)** — 9 widgets in a `react-grid-layout` grid. Each widget should be a `Card` with `CardHeader`/`CardContent`. Widget types:
   - AccountBalancesWidget — table with account rows
   - ThisMonthWidget — income/expense/available summary cards
   - BalanceProjectionWidget — progress bar + threshold warning
   - QuickAddWidget — embedded quick-add form
   - CashRunwayWidget — days counter with progress
   - MoneyPulseWidget — dismissible daily brief (alert)
   - AttentionQueueWidget — urgent/review/suggestion badges
   - AvailableToSpendWidget — big number display
   - UpcomingPaymentsWidget — table of next 7 days

5. **Contracts (`components/contracts/`)** — List page with shadcn `table` (filterable, sortable), health badges, multi-select with batch actions. Detail page with tabs (Overview, Zahlungen, Dokumente), price history chart.

6. **Calendar (`components/calendar/`)** — Payment calendar with month grid, grouped daily view, running balance. Use `card` for day cells, `badge` for payment indicators.

7. **Analytics (`components/analytics/`)** — Tabbed interface using shadcn `tabs`. Six visualizations: Spending by Category (horizontal bars), Monthly Overview, Fixed vs Variable, Trends, Budget Alerts. Use shadcn chart colors (`--chart-1..5`).

8. **Quick Add (`components/quick-add/`)** — Overlay triggered by Cmd+N. Amount input, category fuzzy search, preset bar, date picker, notes. Use `dialog` or `sheet` for the overlay, `input`, `select`, `button` for the form.

9. **Review Queue (`components/review/`)** — Inbox-style list with priority badges (urgent=destructive, review=warning, suggestion=primary). Batch actions via `dropdown-menu`. Filter by type/priority using `tabs` or `select`.

10. **Import Wizard (`components/import/`)** — Multi-step wizard using `card` steps, `progress` indicator, file upload area, preview table, account mapping `select`.

11. **Tags (`components/tags/`)** — CRUD interface with `table`, `dialog` for create/edit, `badge` for tag display, `input` for search.

### Phase 3: Upstream Pages (Actual Budget core)

12. **Account Pages (`components/accounts/`)** — Transaction list is the most-used view. Use shadcn `table` with `scroll-area`. Filter bar with `popover` + `select`. Transaction row actions via `dropdown-menu`.

13. **Budget Editor (`components/budget/`)** — Category groups as `accordion`, budget cells as styled `input`, envelope budgeting display with `progress` bars.

14. **Settings (`components/settings/`)** — Settings sections using `card` groups, `switch` for toggles, `select` for dropdowns, `separator` between sections. Feature flag toggles in Experimental section.

15. **Modals (`components/modals/`)** — Replace all `react-modal` usage with shadcn `dialog`. Confirmation dialogs with `alert-dialog`.

### Phase 4: Common Components & Polish

16. **Toast System** — Replace custom `Toast.tsx` with shadcn `sonner`. Add `<Toaster />` to app root.

17. **Command Palette (`CommandBar.tsx`)** — Already uses `cmdk`. Restyle with shadcn `command` component for consistent look.

18. **Form Controls** — Replace all `@actual-app/components` Input, Select, Button with shadcn equivalents throughout the app. Use `label` + `input`/`select`/`textarea` pattern.

19. **Loading States** — Replace all custom loading indicators with shadcn `skeleton` and `progress`.

20. **Empty States** — Design consistent empty state patterns using `card` + illustration + action button.

## Migration Rules

### DO
- Use `cn()` from `@/lib/utils` for all className merging
- Use Tailwind utility classes (e.g., `bg-card`, `text-muted-foreground`, `rounded-lg`)
- Use theme CSS variables via Tailwind (e.g., `bg-primary`, `text-destructive`, `border-border`)
- Use shadcn component variants (e.g., `<Button variant="outline" size="sm">`)
- Keep `react-aria-components` for complex accessible patterns where shadcn doesn't cover
- Keep `react-grid-layout` for dashboard (layout engine, not UI component)
- Keep `recharts` for charts (wrap with shadcn chart component if available)
- Maintain all existing functionality — this is a UI reskin, not a feature change

### DON'T
- Don't use `@emotion/css` for new code — use Tailwind classes
- Don't use `style={{ }}` inline styles — use Tailwind classes
- Don't use `@actual-app/components` View/Text — use `<div>`/`<span>` with Tailwind
- Don't import colors from the legacy theme — use CSS variables (`bg-primary`, `text-foreground`)
- Don't create custom styled wrappers when shadcn has the component
- Don't change any business logic, API calls, state management, or data flow
- Don't break keyboard shortcuts, hotkeys, or accessibility
- Don't modify `loot-core` or `sync-server` — this is frontend-only

### Coexistence Strategy

During migration, both systems coexist:
- Old: `@emotion/css` + `@actual-app/components` (View, Text, Button, etc.)
- New: Tailwind + shadcn/ui
- Migrate page-by-page, component-by-component
- A page can mix old and new during transition
- Final goal: remove `@emotion/css` dependency entirely

## File-by-File Priority

| Priority | File/Directory | Impact |
|----------|---------------|--------|
| 1 | `sidebar/` | Seen on every page |
| 2 | `dashboard/` + widgets | Landing page, first impression |
| 3 | `common/` (Toast, Search) | Used everywhere |
| 4 | `quick-add/` | High-frequency interaction |
| 5 | `contracts/` | Custom page, heavy table use |
| 6 | `calendar/` | Custom page, card-heavy |
| 7 | `analytics/` | Custom page, chart + tabs |
| 8 | `review/` | Custom page, list + badges |
| 9 | `import/` | Wizard flow |
| 10 | `tags/` | Simple CRUD |
| 11 | `accounts/` + `transactions/` | Upstream, most complex |
| 12 | `budget/` | Upstream, very complex |
| 13 | `settings/` | Low frequency |
| 14 | `modals/` | Used everywhere, many files |
| 15 | `reports/` | Upstream, low priority |

## Technical Notes

- **TypeScript**: Strict. Prefer `type` over `interface`. Named exports only.
- **React 19**: No `React.FC`. Type props directly: `function Component({ title }: { title: string })`
- **Routing**: React Router v7. Import `useParams` from `'react-router'` (not `react-router-dom`).
- **State**: Redux + `useSyncedPref()` for persistent prefs. `@tanstack/react-query` for server state.
- **i18n**: Use `<Trans>` component for user-facing strings.
- **Button API**: shadcn Button is fine (uses Radix, not react-aria). The existing react-aria `isDisabled` pattern is in upstream components — leave those unless migrating the component.
- **Build**: Vite 7 + `@tailwindcss/vite` plugin. Tailwind v4. No PostCSS config needed.
- **Dev server**: `yarn start` at localhost:3001.

## Quality Checklist (per component)

- [ ] Uses shadcn components where available
- [ ] Uses Tailwind classes (not inline styles or emotion)
- [ ] Uses theme CSS variables (not hardcoded colors)
- [ ] Responsive (works at 1280px+ desktop width minimum)
- [ ] Dark mode works (uses `.dark` variant tokens)
- [ ] Keyboard accessible (tab order, focus rings via `--ring`)
- [ ] No visual regressions (same information density)
- [ ] TypeScript compiles (`yarn typecheck`)
- [ ] Existing functionality preserved

## Example: Before/After

### Before (emotion + @actual-app/components)
```tsx
import { css } from '@emotion/css';
import { View, Text, Button } from '@actual-app/components';
import { theme } from '../../style';

function Widget({ title, children }) {
  return (
    <View style={{ background: theme.cardBackground, borderRadius: 8, padding: 16, border: `1px solid ${theme.tableBorder}` }}>
      <Text style={{ fontSize: 14, fontWeight: 600, color: theme.pageTextSubdued }}>{title}</Text>
      <View style={{ marginTop: 8 }}>{children}</View>
      <Button type="primary" style={{ marginTop: 12 }}>Action</Button>
    </View>
  );
}
```

### After (Tailwind + shadcn)
```tsx
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  );
}
```

## Start Here

1. Read `packages/desktop-client/src/components/sidebar/Sidebar.tsx` and `PrimaryButtons.tsx`
2. Use the shadcn MCP to install the `sidebar` component
3. Rebuild the sidebar using shadcn sidebar + our `--sidebar-*` theme tokens
4. Move to dashboard widgets, then outward through the priority list
