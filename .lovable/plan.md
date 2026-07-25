## Role Summary Card — polish + capability breakdown

Rework `src/components/admin/access-control/RoleSummaryCard.tsx` only. No data-layer or business logic changes; permissions still come from `rolePermissions` and `PERMISSION_MODULES` in `permission-catalog.ts`.

### 1. Capability classification (client-side)

Bucket every permission in `PERMISSION_MODULES` by action so the card can tell the admin what the newly added user will actually be able to do:

```text
Read         → view
Write        → create, update, assign, reassign
Approve      → approve, reject, resolve, escalate, configure
Destructive  → suspend, manage_permissions
Export       → export
```

For the selected role, split every catalog permission into:
- **Granted** in that bucket (present in `rolePermissions`)
- **Restricted** in that bucket (absent from `rolePermissions`)

Render one row per bucket showing `granted / total` with a thin progress bar; expand into module-grouped chips underneath.

### 2. New card layout

Same rounded card, denser and clearer hierarchy:

```text
┌───────────────────────────────────────────────┐
│ Support Agent              [Standard Access]  │  header + tinted level pill
│ Views support-related transaction…            │
│ ────────────────────────────────────────────  │
│ [!] Requires approval before activation       │  only for protected/high/full
│                                               │
│ CAPABILITY OVERVIEW                           │
│  Read        ██████████░░  12 / 14            │
│  Write       ███░░░░░░░░░   2 / 9  •  limited │
│  Approve     ░░░░░░░░░░░░   0 / 8  •  none    │
│  Destructive ░░░░░░░░░░░░   0 / 3  •  blocked │
│  Export      █████░░░░░░░   3 / 7             │
│                                               │
│ MODULES IN SCOPE                              │
│  [Dashboard] [Transactions] [Disputes] …      │
│                                               │
│ WHAT THIS USER CAN DO                         │
│  ● Read      Dashboard, Transactions, …       │  emerald dot
│  ● Write     Disputes (update, assign)        │  sky dot
│  ● Approve   —                                │
│  ● Export    Reports, Audit Logs              │  violet dot
│                                               │
│ RESTRICTED (top 5, "+N more")                 │
│  ⊘ escrow.approve                             │  rose subtle
│  ⊘ escrow.configure                           │
│  ⊘ disputes.approve                           │
│  ⊘ identity_verification.approve              │
│  ⊘ users_and_access.suspend                   │
│                                               │
│ 🛡 Access changes are logged to the audit     │
│    trail.                                     │
└───────────────────────────────────────────────┘
```

### 3. Aesthetic pass

- Card: `rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/60 shadow-sm ring-1 ring-border/30`.
- Header: role name at `text-base font-semibold`, description at `text-xs text-muted-foreground leading-snug`; access-level pill keeps existing color tokens (`rose/amber/sky/slate` for full/high/standard/limited).
- Section labels: `text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground` with a 1px `bg-border/60` divider above (not full-width — inset 4px).
- Capability bar: 6px height, `bg-muted/40` track, filled with a per-bucket accent (`emerald / sky / amber / rose / violet`) at low opacity (`/70`), rounded-full; row shows count + a tiny status word (`limited`, `none`, `blocked`, `partial`, `full`).
- Module chips: keep pill style, add subtle hover (`hover:bg-muted transition-colors`) and cap the visible list at 6 with a `+N more` chip.
- Grant list: use a small colored dot (per-bucket accent) instead of the current `CheckCircle2`; module names in `text-foreground/80`, actions in `text-muted-foreground` — no raw `module.action` keys in this section (kept only in Restricted).
- Restricted list: rose "⊘" icon (`Ban` from lucide) + `font-mono text-[11px]`, capped at 5 with `+N more`; hover reveals full label via `title=`.
- Footer note: unchanged copy, softer separator, `ShieldCheck` at `text-emerald-400/70`.
- Micro-interaction: `animate-in fade-in-50 slide-in-from-right-1` when the selected role changes (key on `role`).

### 4. Empty state

Keep current "No role selected" block but upgrade to the same rounded-2xl gradient shell with `Sparkles` in a tinted circle so it visually matches the populated card.

### 5. Non-goals

- No changes to `permission-catalog.ts`, `AddUserDrawer.tsx`, services, DB, or tests.
- No new packages.
- Existing `KEY_ACTIONS` heuristic is retired in favor of the bucket model above.

### Files
```
edit  src/components/admin/access-control/RoleSummaryCard.tsx
```
