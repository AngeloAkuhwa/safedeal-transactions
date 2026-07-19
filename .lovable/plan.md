# Audit Logs — 1:1 fidelity pass

Scope: only `src/pages/AdminAuditLogs.tsx`. No backend, service, route, or sidebar changes. Column set, filters, drawer, and pagination logic stay as-is — this pass is purely visual parity with the attached HTML + screenshot.

## Gaps identified vs the reference

1. **Header shell** — HTML puts the header *inside* the scroll container with `sticky top-0`. Our `headerSlot` currently renders through `AdminLayout` which can add wrapper padding. We'll drop `headerSlot` for this screen and render the header at the top of the content area with `sticky top-0 z-30`, so it exactly matches the reference (title 20px `text-xl font-semibold`, subtitle `text-sm text-slate-400`, pills at 12px, right-side buttons at `px-4 py-2 text-sm font-medium`).
2. **Compliance Report icon** — HTML uses `fa-file-shield`. We're using `FileCheck2` which reads as a checklist. Swap to `ShieldCheck` to match the shield-on-document silhouette (closest Lucide match).
3. **Action tile icons** — HTML mapping is stricter than ours:
   - `User Suspended` → `UserX` in red (already correct).
   - `Payment Processed` → `Banknote` in emerald (correct).
   - `Dispute Filed` → `Scale` in yellow (correct).
   - `Settings Changed` → `Settings` in purple (already correct).
   - Missing: `Login/Logout` → `LogIn`/`LogOut` in slate; `Data Export` → `Download` in slate; `Transaction Created/Updated` → `Receipt` in blue; `Refund Issued` → `Undo2` in orange; `Dispute Resolved` → `Gavel` in emerald. Extend `actionIconFor` to cover these keywords so every reference row matches.
4. **Actor cell for system/automated actors** — HTML renders System with a **rounded-full** blue tile containing a `Bot` icon and `role = "Automated"`. Currently we always show avatar-or-user-icon. Add: if `actor.role === "system"` OR `actor.name` contains "System"/"Automated", render the blue rounded-full Bot tile with role label "Automated".
5. **Actor avatar ring** — HTML uses `border-2 border-red-500/40` **only** on critical rows and no ring elsewhere. Our code adds `border-slate-700` on non-critical which is subtly wrong. Change to `border-2 border-red-500/40` for critical and no border ring otherwise (drop the slate ring).
6. **Target subtitle** — Reference shows values like `$2,450.00 USD`, `john.doe@email.com`, `Case #DSP-2024-1247`. Ours renders "Transaction" / "Dispute" as literal subtitles. Change subtitles to: user → email (or `—`); transaction → the transaction code if the shaper provides it, else `Transaction #<short>`; dispute → `Case ID` short.  (Data-side: we already return `user_email`; leaving `transaction_code` for a later backend enrichment. For now show short-ID + a soft label matching HTML sizing/color.)
7. **IP cell subtitle** — HTML shows a geo/context line (`San Francisco, US`, `Internal Server`). We have no geo data; render only the IP in `text-slate-300 text-sm font-mono` and drop the "Recorded"/"Not captured" line so we don't invent data. Keep spacing so column height stays aligned.
8. **Table header sticky offset** — We set `sticky top-[88px]` which drifts as the outer sticky header height changes. After we move the page header inline (item 1), compute the offset with `top-[73px]` (h-of-header = py-5 + text-xl line + subtitle) or, more robust, wrap header + thead in a shared sticky column and use `top-0` on the header and `top-[73px]` on the thead. Verify visually.
9. **Row tint borders** — HTML uses `border-l-4` on tinted rows. Our `rowTint` already does this. Confirm the border-color is visible against the base `bg-slate-900` table (currently `border-red-500`, `border-orange-500`, `border-yellow-500` — good). Ensure `<tr>` uses `border-l-4` at the row level, not on the `<td>`, so it spans full row height.
10. **Meta labels & spacing** — Small typography touches to match the HTML exactly:
    - "Audit Log Entries" section subtitle should read `<total> entries • Showing <n> • Immutable records` (drop the "page X of Y" that we added inline; keep pagination controls below).
    - Search Query placeholder already matches.
    - "Save Filter Preset" button color = `bg-blue-600` (already correct).
    - Stat card icon sizes: HTML uses `text-lg` (~18px). Our `h-5 w-5` (20px) is close; keep.
11. **Action buttons cluster** — HTML always renders the User button in purple even if there's no target user (it just navigates). We hide it when there's no `target.user_id`. Keep our conditional (it's correct behavior — avoids dead buttons), but for `Target` navigation matching HTML: when the row targets a dispute, render an orange "Dispute" button that routes to `/admin/disputes/<id>`. Add that alongside the existing TXN button.

## Non-goals

- No changes to `admin-audit-logs` edge function, `admin-audit-logs.service.ts`, sidebar, routing, or any other page.
- Not adding geo lookup for IPs.
- Not adding "Quick Filters" or "Save Filter Preset" behavior beyond the existing toast placeholder (HTML shows them as static buttons too).

## Verification

- Load `/admin/audit-logs` and side-by-side compare against the screenshot: header shell, 4 stat cards, filters card, table row for a critical event (red left border + pulsing CRITICAL pill), a payment event (emerald tile + Info pill), a dispute event (yellow tile + yellow tint).
- Resize to `lg` breakpoint to confirm the "Last entry" pill hides <lg, "Details/JSON/User/TXN" labels hide <xl exactly like HTML.
- Scroll the table to confirm the sticky header + sticky thead both stay pinned and the row left-borders remain visible.
