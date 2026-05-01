## Phase C — Seller Dashboard, Alerts, Onboarding (full revision)

Implements seller-facing alerts, onboarding checklist, real-time bell badge, alerts drawer, metrics alignment, and SafeDeal-specific empty states. Backend is the single source of truth — UI renders only what `seller-dashboard` returns.

**Non-goals:** No admin release UI. No buyer flow changes. No payout/refund triggers. No seller-initiated payout retry.

**Wording rule (non-negotiable):**
Use **Awaiting Release**, **SafeDeal is reviewing the release**, **Release Processing**, **Bank Account Required**, **Verification Required**, **Action Required**.
Never expose to sellers: *Awaiting Admin Release*, *Admin will release funds*, *Admin review*, *Awaiting admin action*. (DB enum is already `awaiting_release` — this is a copy-only rule across UI and edge function output.)

---

## C1 — Extend `seller-dashboard` edge function

**File:** `supabase/functions/seller-dashboard/index.ts`

Add parallel queries for: `payout_accounts` row, `account_verifications` (already fetched — extend select), open `disputes` + their seller responses, `payouts` by status, `products` for stock signals, `delivery_proof_files` (already partially queried — broaden), and unread counts on `notifications` + `transaction_messages`.

### Response shape (additive, backwards compatible)

```ts
{
  seller: {
    full_name, avatar_url, store_slug, created_at,
    verification_level, verification_label,
    identity_verified: boolean,           // NEW
    payout_account_present: boolean,      // NEW
    payout_account_verified: boolean,     // NEW
    has_published_products: boolean,      // NEW
  },
  metrics: {
    transactions_created_count,
    active_transactions_count,                // NEW: not draft, not completed, not refunded, not cancelled
    completed_transactions_count,             // NEW
    awaiting_buyer_payment_count,             // NEW
    awaiting_buyer_confirmation_count,        // NEW (status=delivered_awaiting_verification)
    awaiting_seller_confirmation_count,       // NEW
    awaiting_release_count,                   // NEW
    open_disputes_count,                      // NEW
    payout_failed_count,                      // NEW
    products_low_stock_count,                 // NEW
    products_out_of_stock_count,              // NEW
    unread_notifications_count,               // NEW
    unread_messages_count,                    // NEW
    // money — unchanged keys + 2dp on the wire (numbers, formatting in UI)
    awaiting_buyer_payment_amount,
    awaiting_buyer_review_amount,
    funds_held_in_escrow_amount,
    funds_pending_release_amount,
    payouts_completed_amount,
    net_paid_to_bank,
    net_pending_bank_transfer,
  },
  alerts: SellerAlert[],                       // sorted by priority, all of them returned
  alerts_summary: {                            // NEW
    total: number,
    by_severity: { critical: number, action_required: number, informational: number },
    visible_count: number,                     // = min(total, 3)
  },
  onboarding: {                                // NEW
    show: boolean,
    completed_steps: number,
    total_steps: number,                       // 3 or 4 depending on plan choice (we use 4)
    steps: Array<{
      key: 'identity'|'payout'|'product'|'transaction',
      title, description, action_label, action_href,
      completed: boolean,
      blocking: boolean,
    }>,
  },
  recent_activity: SellerActivity[],
  quick_actions: { draft_count },
}
```

### Alert producer schema

```ts
type Severity = 'critical' | 'action_required' | 'informational';
type SellerAlert = {
  type: string;                 // see catalog below
  severity: Severity;
  title: string;
  message: string;
  action_label: string;
  action_href: string;
  secondary_action?: { label: string; href: string };
  count?: number;
  blocking: boolean;            // true => not dismissible
  dismissible: boolean;         // false unless explicitly true
  metadata?: Record<string, unknown>;  // type-specific (due_at, hours_remaining, etc.)
  priority: number;             // 1..10 — backend assigns, used for sort
};
```

### Alert catalog (with conditions, severity, copy, priority)

| Pri | Type | Condition | Severity | Title / Message | Action | Blocking | Dismissible |
|-----|------|-----------|----------|------------------|--------|----------|-------------|
| 1 | `payout_failed` | Any `payouts` row for seller with `status IN ('failed','reversed')` | critical | **Release failed** — A payment release failed. SafeDeal is reviewing it. You may need to update your payout account. | "Fix payout account" → `/seller/profile?section=payout`; secondary: "Contact support" → `/seller/support` | true | false |
| 2 | `dispute_response_required` | Open dispute on seller's tx with `status IN ('open','seller_response_pending')` AND no row in `dispute_responses` for that dispute AND `seller_response_due_at IS NOT NULL` | **critical** if `hours_remaining ≤ 12` OR overdue, else **action_required** | **Dispute response required** — A buyer raised a dispute. Respond before the deadline to protect your transaction. | If count=1: "Respond now" → `/seller/disputes/{dispute_id}`; if multiple: → `/seller/disputes?filter=needs_response` | true | false |
| 3 | `payout_account_required` | No `payout_accounts` row for `user_id=userId` | critical | **Add payout account** — Add a verified bank account so SafeDeal can process your releases. | "Add bank account" → `/seller/profile?section=payout` | true | false |
| 4 | `payout_account_unverified` | Row exists but `provider_recipient_code IS NULL` OR `verification_status != 'verified'` | **critical** when `funds_pending_release_amount > 0` OR any payout in `awaiting_release/pending/processing`, else **action_required** | **Verify payout account** — Your payout account has not been verified yet. Update your bank details to avoid payout delays. | "Fix payout account" → `/seller/profile?section=payout` | true | false |
| 5 | `delivery_proof_required` | Tx where `status IN ('seller_dispatched','delivered_awaiting_verification')` AND `money_status IN ('funds_held_in_escrow','funds_pending_release')` AND no `delivery_proof_files` row AND no open dispute | action_required | **Upload delivery proof** — Upload delivery evidence so the buyer and SafeDeal can verify fulfillment. | If count=1: "Upload proof" → `/seller/transactions/{transaction_id}/delivery`; else `/seller/transactions?filter=delivery-proof-needed` | true | false |
| 6 | `awaiting_seller_confirmation` | Tx where `buyer_confirmed_at IS NOT NULL AND seller_confirmed_at IS NULL AND money_status='funds_held_in_escrow' AND seller_id=userId` AND no open dispute AND `status NOT IN ('refunded','cancelled')` | action_required | **Confirm completed deals** — Buyers have confirmed receipt. Confirm completion so SafeDeal can move these transactions to **Awaiting Release**. | If count=1: "Confirm now" → `/seller/transactions/{transaction_id}`; else → `/seller/transactions?filter=awaiting_seller_confirmation` | true | false |
| 7 | `identity_verification_required` | `account_verifications.identity_verified = false` AND (≥1 paid/completed tx OR `has_published_products`) | action_required | **Verify your identity** — Complete identity verification to increase buyer trust and keep your seller account fully active. | "Verify identity" → `/seller/profile?section=identity` | false | true |
| 8 | `low_stock_warning` | `products` where `seller_id=userId AND status='published' AND (stock_quantity - reserved_quantity) BETWEEN 1 AND 3` | action_required | **Low stock warning** — Some published products are almost sold out. Update stock to avoid missed sales. | "Update stock" → `/seller/storefront?filter=low_stock` | false | true |
| 9 | `out_of_stock_published` | `products` where `seller_id=userId AND status='out_of_stock' AND updated_at >= now() - interval '7 days'` | informational (or action_required if also has low_stock) | **Products marked out of stock** — Some products were marked out of stock recently. Restock them when available. | "Review products" → `/seller/storefront?filter=out_of_stock` | false | true |
| 10 | `awaiting_release` | Any payout `status='awaiting_release'` OR any tx with `money_status='funds_pending_release'` for seller, AND no open dispute on those | informational | **Awaiting release** — Both parties have confirmed. SafeDeal is reviewing the release. | "View releases" → `/seller/payouts?filter=awaiting_release` | false | true |

**Metadata payloads:**
- `dispute_response_required`: `{ dispute_id?, due_at, hours_remaining, is_overdue }` (earliest open dispute when count > 1).
- `awaiting_seller_confirmation` / `delivery_proof_required` / `awaiting_release`: `{ transaction_id? }` when `count === 1`.
- `payout_failed`: `{ payout_id?, last_failure_reason? }` when `count === 1`.
- `low_stock_warning` / `out_of_stock_published`: `{ product_count }`.

**Sort:** by `priority` ascending, then `severity` (critical → action_required → informational).
**Backend never trims** — returns all alerts. UI decides how many to show.

### Onboarding payload

Backend computes:
- `step.identity.completed = seller.identity_verified === true`
- `step.payout.completed = seller.payout_account_present && seller.payout_account_verified`
- `step.product.completed = has_published_products` (any product with `status='published'`)
- `step.transaction.completed = transactions_created_count > 0`
- `onboarding.show = NOT (all four completed)` AND we are showing the dashboard (always evaluated server-side; UI just respects `show`).
- `total_steps = 4`, `completed_steps = sum of completed`.

---

## C2 — `SellerAlertBanners.tsx`

**File:** `src/components/seller/SellerAlertBanners.tsx`

Pure presentation: maps each backend alert `type` to icon + tone tokens. No business logic.

### `alertConfig` map (10 entries)

| Type | Icon (lucide) | Tone | Tailwind tokens |
|------|---------------|------|-----------------|
| `payout_failed` | `AlertOctagon` | critical (red) | `bg-destructive/5 border-destructive text-destructive` |
| `dispute_response_required` | `Scale` | critical/amber per `severity` field | `destructive` if critical, `amber` otherwise |
| `payout_account_required` | `Wallet` | critical | destructive tokens |
| `payout_account_unverified` | `ShieldAlert` | critical/amber per `severity` | dynamic |
| `delivery_proof_required` | `PackageCheck` | amber | amber tokens |
| `awaiting_seller_confirmation` | `CheckCircle2` | amber | amber tokens |
| `identity_verification_required` | `BadgeCheck` | amber | amber tokens |
| `low_stock_warning` | `AlertTriangle` | amber | amber tokens |
| `out_of_stock_published` | `PackageX` | sky/info | sky tokens |
| `awaiting_release` | `Clock` | sky/info | sky tokens |

Tone resolution: if backend sets `severity='critical'`, force destructive tokens regardless of base mapping (handles `dispute_response_required` overdue and `payout_account_unverified` with funds at stake).

### Banner rendering rules

- Icon, title, message, `count` badge (if `>1`), countdown chip (only when `metadata.due_at` exists — renders `"X h Y m left"` or `"Overdue by X h"`).
- Primary action button (always).
- Secondary action button (when `secondary_action` provided — only `payout_failed` today).
- Dismiss "×" button **only** when `alert.dismissible === true`.
  - Dismiss writes to `localStorage` key `safedeal:seller_alerts_dismissed:{userId}` as `{ [type]: ISO_timestamp }`.
  - Dismissals expire after 24h; after expiry the banner returns. Critical/blocking alerts ignore the localStorage entry entirely.
- Compact layout: icon + 2 lines of text + button on the right; stacks on mobile.
- All copy comes from backend — component never renders fallback strings except generic "Action needed".

### Top-3 display rule

`SellerDashboard.tsx` (NOT this component) selects the first 3 non-dismissed alerts after sort and passes them in. Component itself just renders what it gets.

### Service typing

Update `src/services/seller-dashboard.service.ts`:
```ts
export type AlertSeverity = 'critical' | 'action_required' | 'informational';
export interface SellerAlert {
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  action_label: string;
  action_href: string;
  secondary_action?: { label: string; href: string };
  count?: number;
  blocking: boolean;
  dismissible: boolean;
  metadata?: Record<string, unknown>;
  priority: number;
}
```
Plus the new `metrics`, `seller`, `alerts_summary`, and `onboarding` fields above.

---

## C3 — `SellerOnboardingChecklist`

**New file:** `src/components/seller/SellerOnboardingChecklist.tsx`

Renders strictly from `data.onboarding`.

### UI

- Card with header "Set up your SafeDeal seller account" and subheader "Complete these steps to start selling with protected payments."
- `Progress` (shadcn) bar: `(completed_steps / total_steps) * 100`.
- Progress text: `"{completed_steps} of {total_steps} completed"`.
- Step rows in fixed order (`identity → payout → product → transaction`):
  - Left: numbered circle (1–4) when incomplete, green `Check` icon when complete.
  - Middle: title + description.
  - Right: CTA button. Primary style on the **first incomplete** step ("next recommended"); ghost style on later incomplete steps; hidden on completed ones (replaced by "Done" pill).
- Footer: secondary link "Learn how SafeDeal works" → `/how-it-works`.
- Auto-collapses (renders `null`) when `data.onboarding.show === false`.

### Mounting in `SellerDashboard.tsx`

- Render `<SellerOnboardingChecklist onboarding={data.onboarding} />` immediately above `SellerRecentActivity` (or above the empty-state block).
- The legacy `hasNoTransactions` empty-state panel is **replaced** by the new C7 empty state (see below) — the checklist sits *above* the empty state when both apply.

---

## C4 — SellerNav bell badge (real counts + realtime)

**File:** `src/components/seller/SellerNav.tsx` (+ small co-located hook)

### Hook: `useSellerUnreadCounts()`

```ts
function useSellerUnreadCounts() {
  // 1. Resolve userId from getSession() once and memoize.
  // 2. useQuery({ queryKey: ['seller-unread-counts', userId], queryFn })
  //    - notifications head-count: .from('notifications')
  //        .select('id', { count: 'exact', head: true })
  //        .eq('user_id', userId).eq('is_read', false)
  //    - messages head-count: .from('transaction_messages')
  //        .select('id', { count: 'exact', head: true })
  //        .eq('recipient_user_id', userId).eq('is_read', false)
  //    - return { notifications, messages, total }
  //    - refetchOnWindowFocus: true, staleTime: 15_000
  // 3. useEffect: subscribe to two postgres_changes channels filtered to userId.
  //    On any INSERT/UPDATE → queryClient.invalidateQueries(['seller-unread-counts', userId])
  //    Also invalidate ['seller-dashboard'] so alerts refresh.
  // 4. Cleanup: supabase.removeChannel on unmount.
}
```

### Badge rendering

- `total === 0` → no badge (just the bell).
- `1 ≤ total ≤ 9` → small rounded chip with the number.
- `total > 9` → `9+`.
- Position: top-right corner of the bell icon, `bg-destructive text-destructive-foreground`, `text-[10px] font-bold`.
- Accessibility: `aria-label={"\${total} unread notifications and messages"}`.

### Realtime publication

Confirm membership; if absent, add an idempotent migration:
```sql
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

`SellerNav` keeps its current props — no userId prop required (hook resolves it internally).

---

## C5 — Seller alerts drawer ("View all alerts")

**New file:** `src/components/seller/SellerAlertsDrawer.tsx`

- Trigger: shown on `SellerDashboard.tsx` only when `data.alerts.length > 3`. Renders a thin row beneath the top-3 banners: `{remaining} more alerts · View all alerts →`.
- Uses shadcn `Sheet` (right side, `w-full sm:max-w-md`).
- Drawer body groups alerts by severity (in this exact order):
  1. **Critical** (red header)
  2. **Action Required** (amber header)
  3. **Informational** (sky header)
- Each item: small icon + title + message + count badge + due chip + primary action button. Same dismiss rules as banner.
- Empty group → hidden header.
- Closes on action click (navigate happens after close).

---

## C6 — Metrics ↔ alerts alignment

Single producer functions inside the edge function so a metric and its corresponding alert can never disagree.

### Helper functions in `seller-dashboard/index.ts`

```ts
const m = computeMetrics(adminClient, userId);  // returns the full metrics object
const a = computeAlerts(adminClient, userId, m); // alerts derive from same row sets
```

`m` reuses the same row sets that `a` uses (single fetch per table). No second round trip.

### Money formatting

- All money fields are returned as **numbers** (NGN units, 2dp precision).
- UI formats with `toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- `SellerMetricsCards.tsx` already does this — verify and keep.
- Add new metric cards (no new monetary values, just counts) to a small "Activity at a glance" row beneath the existing money cards: 4 chips for `awaiting_seller_confirmation_count`, `awaiting_release_count`, `open_disputes_count`, `payout_failed_count` (each chip color-matches the corresponding alert tone). Each chip is a button linking to the relevant filtered list.

### Cross-checks (asserted server-side via simple equalities)

- `awaiting_release_count === number_of_payouts_in_awaiting_release + number_of_tx_in_funds_pending_release_with_no_payout_yet`.
- `awaiting_seller_confirmation_count === count of alerts.find(type='awaiting_seller_confirmation')?.count || 0`.
- `payout_failed_count === count of alerts.find(type='payout_failed')?.count || 0`.

---

## C7 — Empty states

**File:** `src/pages/SellerDashboard.tsx`

Replace the generic "No transactions yet" panel with three branches, picked server-side via simple flags exposed in the response (no extra API calls needed):

| Condition | Title | Message | CTAs |
|-----------|-------|---------|------|
| Onboarding incomplete (`onboarding.show === true`) | (Checklist replaces empty state) | — | — |
| Has products, no transactions (`has_published_products && transactions_created_count === 0`) | **Share your store or create a protected deal** | Your products are ready. Share your storefront or create a direct deal link for a buyer. | "View storefront" → `/seller/storefront`; "Create protected transaction" → `/seller/transactions/new` |
| No products, no transactions (and onboarding hidden) | **Start your first protected deal** | Create a product listing or send a protected transaction link to a buyer. SafeDeal holds payment securely until the transaction is confirmed. | "Create product" → `/seller/storefront/new`; "Create direct deal" → `/seller/transactions/new` |

Render rule: if `data.recent_activity.length === 0`, evaluate the table above. Otherwise render the existing `SellerRecentActivity` block.

---

## C8 — Acceptance criteria checklist

Build is "done" only when **all** pass:

1. `seller-dashboard` returns `alerts`, `alerts_summary`, `onboarding`, and the new metrics keys.
2. Dashboard shows **at most 3** alert banners. Remainder accessible via "View all alerts" drawer.
3. Drawer groups by Critical → Action Required → Informational.
4. Backend assigns `priority` and `severity`; UI sorts by `priority` and resolves tone purely from `severity`.
5. No seller-facing copy uses "admin release", "admin will release", "admin review", "awaiting admin action". Replaced everywhere with "Awaiting Release" / "SafeDeal is reviewing the release".
6. `SellerOnboardingChecklist` appears whenever `onboarding.show === true`. Auto-hides when complete.
7. Empty state replaced per C7; legacy "No transactions yet" panel removed.
8. Bell badge displays real, live unread `notifications + transaction_messages` count, hidden at 0, `9+` cap.
9. Bell badge updates within 1s of new event via realtime channel (notifications and transaction_messages).
10. All 10 alert types are produced and rendered correctly.
11. Critical alerts (`blocking: true, dismissible: false`) cannot be dismissed; amber/info alerts marked `dismissible: true` can be dismissed for 24h via localStorage.
12. Seller cannot trigger payout retry from anywhere in the UI (no UI surface added for it).
13. Money values rendered with 2dp via `toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2})`.
14. Aggregate equalities hold: `awaiting_release_count`, `awaiting_seller_confirmation_count`, `payout_failed_count` match their alert `count` fields.
15. UI verified for all 8 seller personas: brand-new, products-no-tx, active-fulfillment, awaiting-seller-confirmation, awaiting-release, payout-failed, open-dispute, low-stock.

---

## Files touched

```text
supabase/functions/seller-dashboard/index.ts                          (extend: producers, metrics, onboarding)
supabase/migrations/<ts>_phase_c_realtime_publications.sql            (idempotent ADD TABLE; only if needed)
src/services/seller-dashboard.service.ts                              (new types: severity, onboarding, alerts_summary, expanded metrics)
src/components/seller/SellerAlertBanners.tsx                          (10-type alertConfig, countdown, dismiss, dynamic tone)
src/components/seller/SellerAlertsDrawer.tsx                          (NEW)
src/components/seller/SellerOnboardingChecklist.tsx                   (NEW)
src/components/seller/SellerNav.tsx                                   (badge + realtime hook)
src/components/seller/SellerMetricsCards.tsx                          (add count chips row, keep existing money cards)
src/pages/SellerDashboard.tsx                                         (top-3 + drawer + checklist + new empty states)
```

## Build order

`C1 (backend producers + onboarding payload) → C6 (metrics alignment in same file) → C2 (banners) → C5 (drawer) → C3 (checklist) → C7 (empty states) → C4 (bell badge) → C8 (verify)`.