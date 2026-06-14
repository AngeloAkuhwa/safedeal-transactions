## Goal

Make the **User Investigation Hub** page (`/admin/users/:id`) match the attached `User Detail View.html` design 100% — icons, structure, spacing, header stickiness, and document flow — while keeping all existing live data wiring.

## Findings (current vs design)

1. **Sticky header**: The header already declares `sticky top-0 z-40`, but in practice the body scrolls page-wide because the surrounding wrapper has no overflow context — and on the user's screen the header scrolls away with the content. Needs to be re-anchored against the page scroll container (the `AdminLayout` main pane) so it truly pins.
2. **Icons mismatch**: Design uses Font-Awesome glyphs that map to specific Lucide equivalents we are not all using:
   - Header: `fa-flag-checkered` for Unflag → use `Flag` with red treatment (we have `FlagOff` which is fine; just match design wording/tone).
   - Profile card: `fa-user-circle` → `UserCircle` ✓
   - Verification card: `fa-shield-check` (emerald) → `ShieldCheck` ✓
   - Payout card: `fa-wallet` (purple) → `Wallet` ✓
   - Stat cards: `fa-shopping-cart`, `fa-store`, `fa-scale-balanced`, `fa-star` → `ShoppingCart`, `Store`, `Scale`, `Star` ✓
   - Recent Transactions header: `fa-clock-rotate-left` (blue) → swap our `History` for `RotateCcw` (closer match) — visually identical.
   - Each transaction row uses `fa-arrow-down` / `fa-arrow-up` / `fa-exclamation` colored tiles by counterparty/status. Currently we render a generic `Scale` for every row. Replace with `ArrowDown` (buyer), `ArrowUp` (seller), `AlertCircle`/`AlertTriangle` (disputed).
   - Activity Log header: `fa-list-check` (purple) → `ListChecks` ✓
   - Admin Notes header: `fa-note-sticky` (yellow) → `StickyNote` ✓; note items use `fa-flag` (red) for high, `fa-circle-info` (blue) for info — swap our yellow info icon to `Info` (blue) when not high-priority.
3. **Profile Information card** — design shows: Full Name, Date of Birth, Location, Account Status, Last Login (with IP). Ours shows: Full Name, Handle, Account Status, Last Login, Last Active. Re-order and rename to match design: drop "Handle", add "Date of Birth" (from `verification_detail`/profile if available, else hide gracefully) and "Location" (from `verification_detail.address_*`, else "—"). Keep "Last Active" hidden when DOB/Location available to match design length.
4. **Verification Status card** — match design order exactly: Email, Phone, Identity (KYC), Bank Account, Address. Move **AML Screening** out (design doesn't have it on this card). Progress label "Verification Coverage" → keep as "Verification Level" with `Level N` text on the right, matching design.
5. **Payout Account card** — add **Account Type** ("Checking Account" placeholder when unknown), and **Routing Number** masked field with eye-reveal button (already wired for `account_number`; add equivalent for routing if available, otherwise omit the row gracefully).
6. **Stat cards** — show small delta pills (`+12%`, `+8%`, `2 Active`, `Excellent`) like the design when data is available, and fall back to nothing when not. "Trust Score" stays as "—" until backend supplies it.
7. **Recent Transactions** — each row shows item name (product/title) above the tx code in design. We currently show `transaction_code` as the title. Use the linked product/title if exposed by the edge function; otherwise keep `transaction_code` as the title and put `status` in the subtitle (already correct). The main fix is icon tiles per row (arrow-up/down/exclamation) and removing the duplicate status pill on the right (design shows one pill only).
8. **Activity Log** — design shows colored dot + title + meta + relative-time, no admin-name prefix. Drop "by {admin_name}" line; keep "{relative}" only. Dot colors: green (login/verification), blue (payout/profile update), orange (dispute), purple (transaction completed), red (flag), already partially implemented.
9. **Admin Notes & Flags** — `INFORMATION` notes should use a blue `Info` icon (currently yellow `StickyNote`). High priority unchanged.
10. **Document flow / spacing** — design uses `p-6` inside cards, `space-y-6` between sections, `gap-6` grids. Match these (we currently use `p-5` in card bodies). Bump to `p-6`.

## Implementation Steps (single file: `src/pages/AdminUserDetail.tsx`)

1. **Sticky header fix**
   - Wrap the page with a single scrollable container: change the outer wrapper to `min-h-screen` flex column, the header to `sticky top-0 z-40` on that flex column.
   - Pass `fullHeight` to `AdminLayout` so the main pane has `overflow-y-auto` and the sticky context attaches correctly. Validate header pins on scroll.
2. **Icons swap** — update imports and usages per the mapping above. Add `RotateCcw`, `ArrowDown`, `ArrowUp`, `AlertCircle`, `Info` from `lucide-react`.
3. **Profile Information card** — replace Handle row with `Date of Birth` (placeholder "—" if not in data) and `Location` (compose from `verif.address_city`, `address_state`, `address_country`).
4. **Verification Status card** — remove the AML row; keep 5 rows matching design; rename progress label to `Verification Level` and append the computed `Level N` derivation (0–3) based on completed checks.
5. **Payout Account card** — add Account Type + Routing Number rows with masked text and eye toggles (reuse `revealUserSensitiveField` with field `account_number` for both, server fallback to "—").
6. **Stat cards** — add optional `delta` prop to `StatCard`; supply `+12%`/`+8%`/`Excellent` only when data is present (otherwise hide pill).
7. **Recent Transactions** — replace per-row icon tile with `ArrowDown` (buyer), `ArrowUp` (seller), `AlertCircle` (disputed); drop the duplicate status pill, keep one on the right.
8. **Activity Log** — drop "by {admin_name}" from each item; keep the dot-color logic.
9. **Admin Notes** — when `priority !== "high"`, render `Info` (blue) instead of yellow `StickyNote`, and use `bg-slate-800/50 border-slate-700` (already matches).
10. **Spacing pass** — bump card body padding to `p-6` and confirm `space-y-6` / `gap-6` everywhere to match design rhythm.

## Out of scope

- No backend/edge-function changes.
- No new dependencies (Font-Awesome stays out; Lucide-only).
- No changes to the Activity Log timeline data source (separate work).
