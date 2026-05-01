# Phase C — Remaining Build (C5 → C3 → C7 → C4 → wire-up → C8)

C1, C6, C2 are already shipped. The backend already returns `alerts`, `alerts_summary`, `onboarding`, the expanded `metrics`/`seller`, and `SellerAlertBanners` already renders the 10-type catalog with severity-driven tone, countdowns, and 24h dismiss. This plan finishes the remaining UI surfaces and the realtime bell, then wires everything into `SellerDashboard.tsx` and verifies end-to-end.

---

## 1. Realtime publication (idempotent migration)

Add `notifications` to `supabase_realtime` (already present for `transaction_messages` and `products`). Migration `<ts>_phase_c_realtime_publications.sql`:

```sql
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

No schema change. Safe to re-run.

---

## 2. C5 — `SellerAlertsDrawer.tsx` (new file)

Path: `src/components/seller/SellerAlertsDrawer.tsx`

- Props: `{ alerts: SellerAlert[]; userId: string; }`.
- shadcn `Sheet` (right side, `w-full sm:max-w-md`).
- Trigger button is rendered by `SellerDashboard` (not by drawer); drawer exposes a controlled `open/onOpenChange` API.
- Body groups alerts in order: Critical → Action Required → Informational. Hide empty groups.
- Each row: icon (reuses the same `alertConfig` map from `SellerAlertBanners` — extract it into `src/components/seller/alertConfig.ts` for reuse), title, message, count badge if `>1`, `due_at` chip if present, primary action button + dismiss `×` (only when `dismissible`). Same 24h `localStorage` rules keyed `safedeal:seller_alerts_dismissed:{userId}`.
- Closes on action click; navigation runs after `onOpenChange(false)`.

Refactor: move the existing `alertConfig`, `formatDueChip`, `dismissalKey` helpers out of `SellerAlertBanners.tsx` into `src/components/seller/alertConfig.ts`. Both banner and drawer import from there. No behavior change to the banner.

---

## 3. C3 — `SellerOnboardingChecklist.tsx` (new file)

Path: `src/components/seller/SellerOnboardingChecklist.tsx`

- Props: `{ onboarding: SellerOnboarding; }`.
- Returns `null` when `onboarding.show === false`.
- Card with header "Set up your SafeDeal seller account" + sub "Complete these steps to start selling with protected payments."
- shadcn `Progress` + `"{completed_steps} of {total_steps} completed"`.
- Step rows in fixed order `identity → payout → product → transaction`:
  - Numbered circle (1–4) when incomplete, green `Check` icon when complete.
  - Title + description from backend.
  - Right column: 
    - Completed → "Done" pill (success tokens).
    - First incomplete step → primary `Button` linking to `action_href`.
    - Later incomplete steps → ghost `Button`.
- Footer link "Learn how SafeDeal works" → `/how-it-works`.
- Uses semantic tokens only.

---

## 4. C7 — Empty states (in `SellerDashboard.tsx`)

Replace the current single `hasNoTransactions` block with a small `<SellerDashboardEmptyState />` co-located component. Selection rules (evaluated only when `data.recent_activity.length === 0` AND `data.onboarding.show === false`):

| Branch | Title | Message | CTAs |
|---|---|---|---|
| `seller.has_published_products && metrics.transactions_created_count === 0` | Share your store or create a protected deal | Your products are ready. Share your storefront or create a direct deal link for a buyer. | "View storefront" → `/seller/storefront`; "Create protected transaction" → `/seller/transactions/new` |
| else | Start your first protected deal | Create a product listing or send a protected transaction link to a buyer. SafeDeal holds payment securely until the transaction is confirmed. | "Create product" → `/seller/storefront/new`; "Create direct deal" → `/seller/transactions/new` |

When `onboarding.show === true`, the checklist renders **above** the empty state and the empty-state branch still renders below it (so a brand-new seller sees both: setup tasks + clear next-step CTA).

Remove the legacy `Store` icon "No transactions yet" block.

---

## 5. C4 — Bell badge with realtime

### 5a. Hook `src/hooks/useSellerUnreadCounts.ts` (new)

```ts
export function useSellerUnreadCounts() {
  // 1. Resolve userId via getSession() in a useEffect; store in state.
  // 2. useQuery(['seller-unread-counts', userId], async () => {
  //      const [n, m] = await Promise.all([
  //        supabase.from('notifications')
  //          .select('id', { count: 'exact', head: true })
  //          .eq('user_id', userId).eq('is_read', false),
  //        supabase.from('transaction_messages')
  //          .select('id', { count: 'exact', head: true })
  //          .eq('recipient_user_id', userId).eq('is_read', false),
  //      ]);
  //      return { notifications: n.count ?? 0, messages: m.count ?? 0,
  //               total: (n.count ?? 0) + (m.count ?? 0) };
  //    }, { enabled: !!userId, staleTime: 15_000, refetchOnWindowFocus: true });
  // 3. useEffect: subscribe to two channels filtered to userId on
  //    notifications (filter: user_id=eq.{userId}) and
  //    transaction_messages (filter: recipient_user_id=eq.{userId}).
  //    On any INSERT/UPDATE: queryClient.invalidateQueries(['seller-unread-counts', userId])
  //    AND queryClient.invalidateQueries(['seller-dashboard']) so alerts/metrics refresh.
  // 4. Cleanup: supabase.removeChannel for both channels.
}
```

Returns `{ notifications, messages, total, userId }`.

### 5b. `SellerNav.tsx` patch

- Call `useSellerUnreadCounts()` (no prop change).
- Replace the static `<span class="absolute ... bg-destructive">` dot with conditional badge:
  - `total === 0` → no badge.
  - `1..9` → small chip showing the number.
  - `>9` → `9+`.
- `aria-label={`${total} unread notifications and messages`}`.
- Tokens: `bg-destructive text-destructive-foreground text-[10px] font-bold`, top-right of bell.

---

## 6. Wire-up in `SellerDashboard.tsx`

- Import the new components and `getSession` to get `userId` for drawer dismiss key.
- Top-of-page (inside the gradient section) order:
  1. `SellerDashboardHero`
  2. **Top-3 alerts** = `data.alerts.slice(0, 3)` filtered through dismissal store, then `<SellerAlertBanners alerts={top3} userId={userId} />`. Existing banner already handles dismissal — pass `userId` through (small refactor: lift `userId` to dashboard so banner & drawer share it).
  3. **"View all alerts" row** when `data.alerts.length > 3`: small button "View all alerts ({remaining} more) →" → opens `<SellerAlertsDrawer />`.
  4. `SellerMetricsCards` (already extended for count chips in C6).
- Below the gradient:
  5. `<SellerOnboardingChecklist onboarding={data.onboarding} />` (renders null when `show` is false).
  6. `recent_activity.length === 0` → `<SellerDashboardEmptyState seller={data.seller} metrics={data.metrics} />`.
  7. else → existing `SellerRecentActivity` + `SellerQuickActions` + `SellerTrustBanner`.

`hasNoTransactions` constant and the legacy empty card are deleted.

---

## 7. Service / type touch-ups

- `src/services/seller-dashboard.service.ts` already exposes `SellerOnboarding`, `SellerAlert`, `SellerMetrics`. Verify `seller.has_published_products`, `seller.identity_verified`, `seller.payout_account_present`, `seller.payout_account_verified`, and `alerts_summary` are typed; add any missing fields.

---

## 8. C8 — Verification (must pass before declaring done)

End-to-end checks via DB + edge function curl + UI eyeball. I will run, in order:

1. `rg -n "auto_released|auto-release|admin release|Admin release|Awaiting Admin|admin will release|admin review" src/ supabase/functions/seller-dashboard supabase/functions/_shared` — must return zero hits in seller-facing surfaces.
2. Curl `seller-dashboard` for a real seller (logged-in session) and verify response contains `alerts_summary`, `onboarding`, the new metric keys, and that `alerts_summary.total === alerts.length`.
3. Verify aggregate equalities server-side via `read_query`:
   - `awaiting_release_count` matches `alerts.find(t==='awaiting_release')?.count || 0`.
   - `awaiting_seller_confirmation_count` matches `alerts.find(t==='awaiting_seller_confirmation')?.count || 0`.
   - `payout_failed_count` matches `alerts.find(t==='payout_failed')?.count || 0`.
4. Confirm `notifications` is in `supabase_realtime` publication (`pg_publication_tables` query).
5. Visual: top-3 cap, drawer renders remaining grouped, checklist auto-hides at 4/4, badge shows `9+` cap, no badge at 0.
6. Confirm `localStorage` dismissal: critical/blocking items still render after a manual `localStorage.setItem` of their type (because banner ignores entry when `blocking || !dismissible`).
7. Confirm no UI surface lets a seller trigger payout retry (search for `retry-payout` references in `src/` — must be empty).

If any check fails, fix and re-run the full block.

---

## Files touched

```text
supabase/migrations/<ts>_phase_c_realtime_publications.sql        (NEW, idempotent)
src/components/seller/alertConfig.ts                              (NEW — extracted shared map + helpers)
src/components/seller/SellerAlertBanners.tsx                      (import from alertConfig; accept userId prop)
src/components/seller/SellerAlertsDrawer.tsx                      (NEW)
src/components/seller/SellerOnboardingChecklist.tsx               (NEW)
src/components/seller/SellerDashboardEmptyState.tsx               (NEW)
src/hooks/useSellerUnreadCounts.ts                                (NEW)
src/components/seller/SellerNav.tsx                               (badge + hook)
src/pages/SellerDashboard.tsx                                     (wire-up + remove legacy empty state)
src/services/seller-dashboard.service.ts                          (type top-up if any field missing)
```

## Build order

`Migration → alertConfig extract → SellerAlertsDrawer → SellerOnboardingChecklist → SellerDashboardEmptyState → useSellerUnreadCounts → SellerNav patch → SellerDashboard wire-up → C8 verification block.`

## Non-goals (unchanged)

No admin UI. No buyer changes. No payout/refund triggers. No seller-initiated payout retry. No new monetary metrics — only count chips on top of existing money cards (already added in C6).
