# Fixes 3 & 4 — Dead links and admin UI truth

Internal admin only, plus two tiny public legal pages. No redesigns, no route renames, no buyer/seller screens touched. No database migration is required for any item below.

## Fix 3 — Dead footer links

`src/components/admin/AdminFooter.tsx` links to `/legal/privacy`, `/legal/terms` and `/admin/support`. None of the three is registered in `src/App.tsx`, so all land on the `*` NotFound catch-all. (`/admin/support` is also already listed in the sidebar's Support & Tools group but is filtered out today because it is not in `BUILT_ROUTES`.)

### New files
- `src/pages/LegalPrivacy.tsx` — public page, no admin chrome. Simple centred prose column using existing design tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `max-w-3xl`), an `h1`, a "Last updated" line and section headings. Copy is placeholder legal text with a clearly visible notice card: "Placeholder policy — replace with your reviewed legal copy before launch." Sets title and meta description for SEO.
- `src/pages/LegalTerms.tsx` — same shell and placeholder notice, Terms of Service sections.
- `src/pages/AdminSupport.tsx` — wrapped in the existing `AdminLayout` (same `title`/`subtitle` props pattern as `AdminReconciliation`). Content: contact channel cards (support email, escalation channel, on-call note) plus a short "Debug & audit basics" card linking, via the existing `useAdminNav().go`, to `/admin/audit-logs`, `/admin/notifications` and `/admin/reconciliation`. Reuses `Card` / `Button` only — no new UI primitives.

### Edited files
- `src/App.tsx` — add three routes: `/legal/privacy` and `/legal/terms` outside the protected block (public, alongside the other public routes), and `/admin/support` inside the admin block wrapped exactly like its siblings (`PermissionRoute`).
- `src/components/admin/useAdminNav.ts` — add `/admin/support` to `BUILT_ROUTES` so the footer link and the existing sidebar entry both resolve instead of firing the "Coming soon" toast.
- `src/services/admin-route-permissions.ts` — add `{ path: "/admin/support", permission: "dashboard.view" }`.

Legal pages are intentionally ungated: `permissionForPath` returns `null` for non-admin paths, so no permission entry is needed.

## Fix 4a — Real admin identity in the sidebar footer

Current state: `AdminSidebar.tsx` hardcodes the avatar letter `A`, the name `Admin User` and the role `Super Admin`.

Data source: the existing `AdminPermissionsContext`, which calls the `admin-me` edge function **once per admin session** (plus a 5-minute visibility-based refresh). Today `admin-me` returns `user_id, email, roles, permissions, access_level, is_super` but no display name.

- `supabase/functions/admin-me/index.ts` — add `full_name` (and `display_id`) by selecting them from `internal_users` for `ctx.userId` inside the existing parallel `Promise.all` batch. Primary-key lookup on a table the function already touches; no extra round trip on the hot path, no unindexed query.
- `src/context/AdminPermissionsContext.tsx` — surface `fullName` on the already-memoised context value.
- `src/components/admin/AdminSidebar.tsx` — footer block renders:
  - name: `fullName` → fall back to the email local-part → `"Admin"`;
  - initials: first letters of the first two name words, uppercased;
  - role label: `ROLE_LABEL[roles[0]]` from the existing `permission-catalog.ts` (static in-memory map, zero queries); `isSuper` wins and shows "Super Admin"; unknown/empty roles show "Team member".
  - Loading state: while `loading` is true, render fixed-size skeleton bars inside the exact same `h-9 w-9` avatar and two text rows, so no layout shift occurs.

No new hook, no new fetch, no per-render network work.

## Fix 4b — Dashboard "Admin Action Required" cards pointing at unbuilt routes

Verified source: `supabase/functions/admin-dashboard/index.ts` lines ~600–605 emit six cards; four point at routes that do not exist.

| Card key | Current `action_href` | Built? | Proposed destination |
|---|---|---|---|
| `awaiting_release` | `/admin/release-queue` | no | `/admin/escrow?state=pending_release` (existing `EscrowQuery.state`) |
| `failed_payouts` | `/admin/payouts` | yes | `/admin/payouts?tab=failed` (existing tab param; matches the alert-row card) |
| `disputes_needing_decision` | `/admin/disputes` | yes | unchanged |
| `stuck_transactions` | `/admin/transactions/stuck` | no | `/admin/transactions?quick=overdue` (existing `AdminTxQuickFilter`) |
| `identity_reviews_pending` | `/admin/identity-reviews` | no | `/admin/users?status=pending&verification=id` (existing `UserDirectoryQuery` values) — interim until a dedicated identity review screen ships |
| `webhook_recon_issues` | `/admin/webhooks` | no | `/admin/reconciliation` (built, `financial_controls.view`) |

The four alert cards below these already emit `action_href: null` and are left as-is; `useAdminNav.go(null)` handles them.

Note: the request referenced `/admin/identity` and `/admin/money-tracing`; the code actually emits `/admin/identity-reviews` and `/admin/webhooks`. The mapping above uses the real values.

Edited files: `supabase/functions/admin-dashboard/index.ts` (hrefs only — counts, keys, labels and severities unchanged). `src/services/admin-dashboard.service.ts` already types `action_href` as `string | null`, so it most likely needs no change.

`AdminUsers.tsx`, `AdminEscrow.tsx` and `AdminTransactions.tsx` already read these params from the URL on mount, so no page changes are needed for the new destinations.

## Fix 4c — Orphaned screens and dead sidebar code

`src/components/admin/AdminSidebar.tsx`:
- Add `{ label: "Offers", href: "/admin/offers", icon: Tag }` to the **Operations** group (after Transactions). `/admin/offers` is in the router, in `BUILT_ROUTES`, and gated by `transactions.view`.
- Add `{ label: "Reconciliation", href: "/admin/reconciliation", icon: Landmark }` to the **Financial** group (after Escrow), gated by `financial_controls.view`. `Landmark` is an existing lucide icon consistent with the other financial icons (`Scale` is already taken by Disputes).
- Remove the dead `const built = true` branch: render `row` directly inside the `<li>`, drop the `built ? … : <Tooltip>"Coming soon"</Tooltip>` wrapper, the false-branch classes and `aria-disabled`. Remove the `Tooltip*` imports if no other consumer remains in the file.

Both new items stay behind the existing permission filter, so users without the required permission will not see them.

## Scalability review

- **4a**: reuses the single existing `admin-me` call per session; the added `internal_users` select is a primary-key lookup inside an existing `Promise.all`. No new client fetch, no React Query entry, no per-render work. Role label resolution is a static map.
- **4b**: string literal changes inside an edge function that already runs; zero added queries. Destination pages run the same paginated, filtered, server-side queries they already run from the UI — no N+1, no full scans.
- **4c**: two extra array entries rendered client-side; the sidebar fetches nothing per item. Removing the tooltip branch shrinks the rendered tree.
- **Fix 3**: legal pages are static markup with no data access. `/admin/support` renders static cards and issues no queries or edge function calls on load.
- No migration, no new index, no new cron job, no new realtime channel.

## Tests

- `src/services/__tests__/admin-route-permissions.test.ts` — assert `permissionForPath("/admin/support") === "dashboard.view"` and that `/legal/privacy` and `/legal/terms` return `null`.
- New test for `isBuiltAdminRoute` covering `/admin/support`, `/admin/offers`, `/admin/reconciliation`.
- New unit test for the initials/role-label helper extracted from the sidebar into a pure module (e.g. `src/lib/admin-identity.ts`): multi-word names, single names, email fallback, super-admin override, unknown role.
- Re-run the existing `admin-auth.contract.test.ts` and `access-audit.contract.test.ts` suites to confirm the `admin-me` payload change causes no regression.

## Risks

- **`admin-me` payload change**: only `AdminPermissionsContext` reads it and the change is additive, so risk is low — but any strict shape assertion elsewhere would need updating.
- **Legacy consumer admin**: a super admin present only in `user_roles` and not in `internal_users` gets `full_name = null`; the email-local-part fallback covers this.
- **Identity reviews destination is an approximation**: `/admin/users?status=pending&verification=id` is not an exact match for the `identity_submissions` count on the card, so the number and the destination list can differ. The alternative is suppressing the card until a dedicated screen ships — say which you prefer.
- **Legal copy is placeholder** and must be replaced before publishing; the pages carry a visible notice saying so.
- **Removing the tooltip branch** is dead-code removal but touches the shared sidebar render path — worth a visual check of the collapsed and mobile sidebar afterwards.