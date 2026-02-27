# Finance OS — Design System v1
## "Clarity Through Restraint"

**Status:** User-validated (brainstorming session 2026-02-27)
**Personality:** Trustworthy Calm — like a good accountant. Quiet confidence, not flashy. Warm, not clinical. Dense but breathable. Color appears only when it has something to say.

**References:** Notion (invisible chrome), Linear (semantic status colors), Superhuman (typographic hierarchy)

**The Test:** Print any screen in grayscale. Can you still tell what's important, what's healthy, and what needs attention — purely from size, weight, and spacing? If yes, color is additional signal, not the only signal.

---

## 1. Surface System (4 Layers)

All colors as CSS custom properties from day 1 (dark mode-ready):

```css
:root {
  /* Surfaces — warm Stone family, not clinical Slate */
  --canvas: 250 250 249;           /* Stone-50  #FAFAF9 */
  --surface: 255 255 255;          /* White     #FFFFFF */
  --surface-elevated: 255 255 255; /* White + shadow */
  --surface-overlay: 255 255 255;  /* White + backdrop */

  /* Shadows (elevation, not decoration) */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);   /* L1: cards */
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);  /* L2: popovers */
  --shadow-lg: 0 16px 48px rgba(0,0,0,0.12); /* L3: modals */
}

.dark {
  --canvas: 12 10 9;              /* Stone-950 #0C0A09 */
  --surface: 28 25 23;            /* Stone-900 #1C1917 */
  --surface-elevated: 41 37 36;   /* Stone-800 #292524 */
  --surface-overlay: 41 37 36;    /* Stone-800 */
}
```

Pure black (#000) never used. Warm black (Stone-900 `#1C1917`) for deepest values.

---

## 2. Text System

```css
:root {
  --text-primary: 28 25 23;       /* Stone-900 #1C1917 — headings, primary content */
  --text-secondary: 87 83 78;     /* Stone-600 #57534E — body, descriptions */
  --text-muted: 120 113 108;      /* Stone-500 #78716C — labels, meta */
  --text-faint: 168 162 158;      /* Stone-400 #A8A29E — captions, timestamps */
}

.dark {
  --text-primary: 245 245 244;    /* Stone-100 #F5F5F4 */
  --text-secondary: 168 162 158;  /* Stone-400 #A8A29E */
  --text-muted: 120 113 108;      /* Stone-500 #78716C */
  --text-faint: 87 83 78;         /* Stone-600 #57534E */
}
```

---

## 3. Semantic Color Language

Colors are a VOCABULARY. Each has ONE job.

```css
:root {
  /* POLARITY (direction of money) */
  --positive: 5 150 105;          /* Emerald-600 #059669 — income, savings, healthy */
  /* Expenses: NO special color. Use --text-secondary + weight 500. */
  /* Most transactions are expenses. If every expense is red, the screen screams. */

  /* URGENCY (attention management) */
  --warning: 245 158 11;          /* Amber-500  #F59E0B — deadline in 60 days */
  --critical: 225 29 72;          /* Rose-600   #E11D48 — overdue, act NOW */

  /* INTERACTION (what can I do?) */
  --accent: 79 70 229;            /* Indigo-600 #4F46E5 — actions, links, focus */
  --accent-hover: 67 56 202;      /* Indigo-700 #4338CA */
  --accent-tint: 238 242 255;     /* Indigo-50  #EEF2FF — selected bg */

  /* INTELLIGENCE (AI/smart features — post-MVP) */
  --smart: 139 92 246;            /* Violet-500 #8B5CF6 */
  --info: 14 165 233;             /* Sky-500    #0EA5E9 */

  /* BORDERS */
  --border: 231 229 228;          /* Stone-200  #E7E5E4 */
  --border-strong: 214 211 209;   /* Stone-300  #D6D3D1 */
}
```

### Status Chips (health indicators)

Each chip gets an **icon + color** for color-blind accessibility:

| Status | Background | Text | Icon | Example |
|--------|-----------|------|------|---------|
| Healthy | Emerald-50 `#ECFDF5` | Emerald-700 `#047857` | `✓` | `✓ Gesund` |
| Warning | Amber-50 `#FFFBEB` | Amber-700 `#B45309` | `⚠` | `⚠ Kündigung` |
| Critical | Rose-50 `#FFF1F2` | Rose-700 `#BE123C` | `✕` | `✕ Überfällig` |
| Inactive | Stone-100 `#F5F5F4` | Stone-500 `#78716C` | `—` | `— Pausiert` |

### Amount Display

```
Income:   +€3.200,00  → weight 600, color: --positive, prefix: +
Expense:  –€890,00    → weight 500, color: --text-secondary, prefix: –
Transfer: €500,00     → weight 400, color: --text-muted, no prefix

In summary cards (2-3 numbers): income=emerald, expense=rose is OK.
In lists (20+ rows): expense=default, income=emerald. Never a wall of red.
```

**Accessibility rule:** Polarity is ALWAYS communicated via `+`/`–` prefix AND weight, not color alone.

---

## 4. Category Color System

12 L1 categories each get a distinct hue, desaturated to 60-70% so they don't compete with semantic colors.

**Usage constraints:**
- ✅ Left border (3px) on cards/rows
- ✅ Small dot (8px) before category label
- ✅ Subtle tinted background in category page header
- ❌ Never as full card background fills
- ❌ Never at full saturation

| Category | Hue | Tailwind Base | Dot/Border Color |
|----------|-----|---------------|-----------------|
| Wohnen | Blue | blue-400 | `#60A5FA` |
| Mobilität | Amber | amber-400 | `#FBBF24` |
| Lebensmittel | Lime | lime-500 | `#84CC16` |
| Freizeit | Purple | purple-400 | `#C084FC` |
| Versicherungen | Violet | violet-400 | `#A78BFA` |
| Finanzen | Teal | teal-400 | `#2DD4BF` |
| Gesundheit | Rose | rose-400 | `#FB7185` |
| Einkäufe | Orange | orange-400 | `#FB923C` |
| Bildung | Yellow | yellow-400 | `#FACC15` |
| Kinder | Pink | pink-400 | `#F472B6` |
| Sonstiges | Stone | stone-400 | `#A8A29E` |
| Einkommen | Emerald | emerald-400 | `#34D399` |

---

## 5. Typography Hierarchy

**Single font family: Inter.** No secondary font. `font-variant-numeric: tabular-nums` for all financial amounts.

| Level | Size | Weight | Color | Use |
|-------|------|--------|-------|-----|
| Display | 32px | 700 | `--text-primary` | Hero metric: "€485 verfügbar" |
| Title | 18px | 600 | `--text-primary` | Page/section headings: "Verträge" |
| Body | 14px | 400 | `--text-secondary` | Descriptions: "Monatlich · Kündigung bis 01.06." |
| Data | 14px | 500-600 | varies | Amounts: `tabular-nums` always. See §3 for color rules. |
| Label | 12px | 500 | `--text-muted` | Column headers, form labels. `uppercase tracking-wide` optional. |
| Caption | 12px | 400 | `--text-faint` | Timestamps, meta: "vor 3 Tagen" |

**Rule:** Weight = importance. Size = hierarchy. The eye follows: Display → Title → Data → Body → Label → Caption.

---

## 6. Spacing & Layout

```
Base unit: 4px
Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64

Card padding:   20px (compact) / 24px (standard)
Card gap:       16px
Page padding:   32px (desktop) / 16px (mobile)
Section gap:    32px
Border radius:  12px (cards) / 8px (inputs/buttons) / 6px (chips/badges)

Max content:    1200px centered
Sidebar:        240px (collapsible to 64px icon-only)
```

---

## 7. Border vs. Spacing Rule

| Context | Treatment |
|---------|-----------|
| Between cards (siblings in grid) | Spacing only, no borders |
| Sections within a card | Thin divider (1px `--border`) OR 16px spacing |
| Rows in a list/table | Bottom border (1px `--border`), no side borders |
| Date groups (calendar) | 24px spacing + subtle background band (`--canvas`) |
| Card edges | `--shadow-sm` only. Border ONLY if surface matches background. |

**Never:** thick borders, double borders, colored borders (except category accent & focus ring).

---

## 8. Focus & Selection States

| State | Treatment |
|-------|-----------|
| Focus ring | `2px solid` `--accent` with `2px offset` — always visible |
| Hovered row | Background `Stone-50` (`#FAFAF9`) |
| Selected row | Background `--accent-tint` (`Indigo-50`) |
| Active/current page | Left border `3px` `--accent` in sidebar |
| Multi-select | Checkbox appears on hover/focus, `--accent-tint` bg, count badge in toolbar |

**Rule:** Focus is NEVER hidden. A keyboard-first app without visible focus is broken.

---

## 9. Empty States

Pattern for pages with no data yet (critical for "Getting to Control" weeks 1-4):

```
┌─────────────────────────────────────────┐
│                                         │
│            [Icon: 48px, Stone-300]       │
│                                         │
│       Noch keine Verträge               │  ← Title: 16px, --text-primary
│                                         │
│   Erfasse deine Miete, Abos und         │  ← Body: 14px, --text-secondary
│   Versicherungen — Kalender und         │
│   Dashboard berechnen sich              │
│   automatisch.                          │
│                                         │
│        [ Ersten Vertrag anlegen ]       │  ← Button: --accent, primary variant
│                                         │
└─────────────────────────────────────────┘
```

Every empty state must: name what's missing, explain the benefit of adding it, provide ONE clear action.

---

## 10. Motion & Feedback

| Action | Duration | Easing | Notes |
|--------|----------|--------|-------|
| Element enter | 150ms | ease-out | Fade + slight translate |
| Element exit | 100ms | ease-in | Fast departure |
| Hover | 150ms | ease-out | Color/opacity only, NO layout shift |
| Press | instant | — | `scale(0.98)` on active |
| Panel slide | 200ms | ease-out | Slide-overs, drawers |
| Skeleton pulse | 1.5s | ease-in-out | Loading state, infinite |
| `prefers-reduced-motion` | 0ms | — | Skip all, show instant states |

**Rule:** Motion confirms action. It never entertains.

---

## 11. Information Density Patterns

### Metric Card
```
┌────────────────────┐
│ VERFÜGBAR          │  ← Label
│ €485               │  ← Display (hero)
│ von €3.200         │  ← Caption
└────────────────────┘
```

### Contract Row
```
┌──────────────────────────────────────────────────────┐
│ ▮ ✓ Gesund  Spotify          –€9,99/Mo    Freizeit  │
│ ↑           ↑ Title           ↑ Data       ↑ Label   │
│ cat-color   name              amount       category   │
│ 3px border                    tabular-nums            │
│                                           27.03. ↑    │
│                                           Caption     │
└──────────────────────────────────────────────────────┘
```

### Calendar Group
```
┌──────────────────────────────────────────────────────┐
│ DIESE WOCHE · 3 Zahlungen · –€976,00                │ ← Label + Data
│ ─────────────────────────────────────                │
│  Mo 03.03   Spotify          –€9,99                  │
│  Mi 05.03   Miete            –€890,00                │
│  Do 06.03   Strom            –€85,00                 │
│  ─── Saldo danach: €1.340,00 ───                     │ ← Caption, right-aligned
└──────────────────────────────────────────────────────┘
```

---

## 12. Component Inventory (MVP)

| Component | shadcn/ui Base | Finance OS Customization |
|-----------|---------------|------------------------|
| Card | `card` | Warm surface, `--shadow-sm`, 12px radius |
| Button | `button` | Primary=`--accent`, destructive=`--critical` |
| Badge/Chip | `badge` | Status chips with icon prefix (§3) |
| Dialog | `dialog` | Slide-over variant for forms |
| Input | `input` | 8px radius, Stone-200 border, focus=`--accent` |
| Select | `select` | Consistent with Input styling |
| Command | `command` | ⌘K palette, consistent with design tokens |
| Scroll Area | `scroll-area` | For long contract lists |
| Skeleton | `skeleton` | Pulse animation for loading |
| Separator | `separator` | 1px `--border`, used sparingly |

Additional needed (install via shadcn):
- `sheet` — slide-over panels for contract form
- `tabs` — page sub-navigation
- `tooltip` — icon button explanations
- `dropdown-menu` — contract actions, bulk operations
- `progress` — budget usage, runway indicator
- `calendar` — date picking in forms

---

## 13. Design Communication Cheat Sheet

| I want to communicate... | Use... |
|--------------------------|--------|
| "This is important" | Display size (32px) + weight 700 |
| "This is secondary" | Smaller size (12px) + `--text-muted` |
| "Money came in" | `+` prefix + emerald + weight 600 |
| "Money went out" | `–` prefix + `--text-secondary` + weight 500 |
| "Everything is fine" | No colored accents. Calm screen. |
| "Pay attention" | Amber chip or left border accent |
| "Act now" | Rose chip or banner |
| "You can interact with this" | Indigo color + cursor-pointer |
| "This belongs to category X" | 3px left border in category hue |
| "AI suggested this" | Violet accent (post-MVP) |
| "Nothing here yet" | Empty state with icon + CTA |
| "This is loading" | Skeleton pulse in card shape |
| "This is selected" | Indigo-50 background |
| "This is focused (keyboard)" | 2px Indigo ring with offset |
