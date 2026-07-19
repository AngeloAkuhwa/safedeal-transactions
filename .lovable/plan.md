## Observations vs reference HTML

Currently `/admin/audit-logs` renders **two stacked header rows**:
1. `AdminLayout`'s default `AdminHeader` — just the title + subtitle.
2. A separate `Toolbar` row inside the main body containing the Immutable / Live / Last-entry chips and the Refresh / Export Logs / Compliance Report buttons.

In the reference HTML (lines 174–204), it's a **single sticky header row**:
- Left: `Audit Logs` title + `Immutable compliance and forensic audit trail` subtitle, followed immediately by the **Immutable** (emerald pill) and **Last entry: 2m ago** (slate pill) chips inline to the right of the text.
- Right: `Export Logs` (slate outline) and `Compliance Report` (emerald filled) buttons on the same row.

Other diffs:
- Chips currently use `text-xs` and smaller padding; reference uses `text-sm` with `px-3 py-1.5`.
- Button icons live to the right of the label (`<span className="ml-2">`); reference is icon-first-left with normal spacing (`gap-2`).
- Buttons hide the label under `sm:` (they disappear on tablets); reference only hides under `sm:` too — OK, but with the extra Refresh button we clutter the row. Keep Refresh as an icon-only ghost button so the reference's two-CTA look is preserved.

## Fix

Replace the default header with a `headerSlot` on `AdminLayout` so the whole thing renders as one sticky bar matching the reference:

```
[Audit Logs                    ] [🛡 Immutable] [🕒 Last entry: 2m ago] [• Live]     [⟳] [⬇ Export Logs] [🛡 Compliance Report]
Immutable compliance and forensic audit trail
```

### Concrete edits (only `src/pages/AdminAuditLogs.tsx`)

1. Delete the standalone `<Toolbar …/>` row currently rendered inside the page body.
2. Build a `renderHeader()` that returns a `sticky top-0 z-20 bg-card border-b border-border px-4 md:px-8 py-5` container with:
   - Left cluster: title `text-xl font-semibold`, subtitle `text-sm text-muted-foreground mt-0.5`, and inline chips (Immutable emerald pill, Last-entry slate pill, Live/Offline dot pill) using `text-sm`, `px-3 py-1.5` to match the reference sizing.
   - Right cluster: icon-only Refresh (ghost), `Export Logs` outline button, `Compliance Report` emerald button — icons on the left, `gap-2`, `text-sm font-medium`.
3. Pass it via `<AdminLayout headerSlot={renderHeader}>` so the mobile drawer trigger is still wired.
4. Keep the existing state, handlers, realtime `live` flag, `lastEntryAt`, and stats/table/drawer below untouched.

No changes to services, edge functions, filters, table, or drawer — this is header-only.