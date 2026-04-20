

# Plan: Expanded test plan + automated execution + full report

## Goal
1. Expand the test plans to cover **every buyer and seller dashboard tab/section** including data correctness checks against the underlying tables.
2. **Execute the tests** that can be automated (DB queries, edge function curls, RLS checks, state machine validation, dashboard data integrity).
3. Deliver a **full report** as `/mnt/documents/safedeal-test-report.md` listing pass/fail per scenario, expected vs actual, table snapshots, and a list of items requiring manual UI verification.

## Scope of automated execution
What I CAN run for you (no UI clicks needed):
- Direct DB integrity checks (RLS, triggers, state machine, FK guards)
- Edge function smoke tests via `supabase--curl_edge_functions` (buyer-dashboard, seller-dashboard, buyer-notifications, seller-notifications, transaction-messages, marketplace, etc.)
- Dashboard payload vs raw-table reconciliation (e.g. `metrics.active_purchases` vs actual `transactions` count for the buyer)
- Verification level computation tests (call `compute_verification_level` for synthetic states)
- Transaction state machine: attempt invalid transitions and assert rejection
- Inventory math: `available = stock - reserved` invariant across all products
- Escrow ledger balance vs `escrow_states` reconciliation
- Notification routing: confirm `direct_message` rows deeplink to the seller route
- Edge function logs scan for errors in last 24h

What requires **you in the browser** (I'll list these explicitly in the report):
- Paystack popup payment (real card)
- Phone OTP delivery (real SMS)
- Email verification clicks
- Cloudinary uploads
- Visual receipt print preview

## Expanded test plan additions

### New Section E — Buyer dashboard data correctness (`/dashboard`)
For a chosen buyer account, assert each surface matches DB:
| Surface | Field | Source of truth | Assertion |
|---|---|---|---|
| Hero | `buyer.full_name` | `profiles.full_name` | exact match |
| Metrics | `active_purchases` | `transactions WHERE buyer_id=? AND status IN active_set` | count match |
| Metrics | `awaiting_delivery` | `status IN (payment_secured, seller_preparing_delivery, seller_dispatched)` | count match |
| Metrics | `awaiting_verification` | `status='delivered_awaiting_verification'` | count match |
| Metrics | `open_disputes` | `disputes WHERE opened_by_user_id=? AND status NOT IN (resolved)` | count match |
| Recent purchases | row order | `transactions ORDER BY created_at DESC LIMIT 5` | order + amount match |
| Recent notifications | row order | `notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 5` | order + title match |

### New Section F — Buyer page-level data correctness
Per page: list expected DB source, run query, assert UI payload matches.
- `/buyer/transactions` list + filters + counts → `transactions` filtered by buyer + RLS
- `/buyer/transactions/:id` → joined view: `transactions, transaction_items, transaction_pricing, agreement_snapshots, transaction_delivery_terms, payments, escrow_states, escrow_ledger_entries, delivery_updates, transaction_messages`
- `/buyer/disputes` list + summary cards → `disputes` + `dispute_responses` counts
- `/buyer/disputes/:id` → `disputes, dispute_evidence, dispute_responses, dispute_outcomes, dispute_status_history`
- `/buyer/notifications` filters + counts → `notifications` aggregated by `type` and `is_read`
- `/buyer/saved` → `saved_products` join `products`
- `/buyer/cart` → `cart_items` join `products` with availability re-check
- `/buyer/profile` tabs → `profiles, account_verifications, identity_submissions, notification_preferences, devices`

### New Section G — Seller dashboard data correctness (`/seller/dashboard`)
| Surface | Field | Source of truth | Assertion |
|---|---|---|---|
| Hero | seller name + storefront slug + verification badge | `profiles, account_verifications` | match |
| Alerts | each alert type | derived from `transactions, disputes, seller_payout_accounts` | count + amount match |
| Metrics | `transactions_created_count` | `transactions WHERE seller_id=?` | count match |
| Metrics | `awaiting_buyer_payment_amount` | sum where `status='awaiting_payment'` | sum match |
| Metrics | `funds_held_in_escrow_amount` | sum from `escrow_states.held_amount` | sum match |
| Metrics | `funds_pending_release_amount` | sum from `escrow_states` where `state='funds_releasing'` | sum match |
| Metrics | `payouts_completed_amount` | sum from `escrow_ledger_entries` (release entries) | sum match |
| Recent activity | order + amounts | `transactions ORDER BY created_at DESC LIMIT 5` | match |
| Quick actions | `draft_count` | `transaction_drafts WHERE seller_id=?` | match |

### New Section H — Seller page-level data correctness
- `/seller/transactions` summary cards (total / in-progress / completed / earned) → reconciliation
- `/seller/transactions/:id` → full join including rider link, delivery terms
- `/seller/products` → `products WHERE seller_id` with status counts; `available = stock - reserved`
- `/seller/products/:id` → join `product_media`, validates 3 images / 1 video constraint
- `/seller/private-offers` → `buyer_specific_product_offers` with status grouping
- `/seller/payouts` → `escrow_ledger_entries` release entries grouped by transaction
- `/seller/disputes` summary → mirror of buyer side, reversed party
- `/seller/notifications` → seller-scoped notifications with `direct_message` filter
- `/seller/profile` tabs → `profiles, seller_payout_accounts, account_verifications`
- `/seller/storefront` → seller catalog visibility logic

### New Section I — Cross-account sync correctness
For a buyer-seller transaction pair created via the parallel flow:
- Buyer's `transactions` row id == Seller's `transactions` row id
- Buyer's notification `payment_secured` event has corresponding seller notification with same `related_transaction_id`
- A `transaction_messages` row from buyer surfaces in both `buyer-notifications` and `seller-notifications` payloads with appropriate `direct_message` type and correct deeplinks
- Escrow ledger sums on both sides reflect same source rows (RLS scopes views identically)

### New Section J — Verification permission engine deep dive
- Run `compute_verification_level(user_id)` for 6 synthetic states; assert returned tier
- Validate gating: insert a buyer + force pre-states; call `cart-checkout` edge function with amounts at boundaries (₦49,999 / ₦50,000 / ₦50,001 / ₦200,001) and assert allow/block
- Confirm `notifications` row of type `verification_reminder` is created on first denial

### New Section K — Edge function health sweep
For every edge function:
- Smoke `OPTIONS` for CORS headers (must include `PATCH, DELETE` where applicable per memory)
- `GET/POST` happy path (using current logged-in browser session token)
- 401 without auth (where required)
- Recent error log scan via `edge_function_errors` + `function_edge_logs`

### New Section L — Database invariants (run as one SQL battery)
- Every `published` product satisfies `stock - reserved > 0` OR has status `out_of_stock`
- Every `payment_secured` transaction has matching `escrow_states.state IN (funds_held_in_escrow, funds_frozen, funds_releasing, funds_released)`
- Every `agreement_locked_at IS NOT NULL` transaction has at least one `agreement_snapshots` row
- Every `disputed` transaction has a `disputes` row with status `open` or `under_review`
- No `dispute_responses` group exceeds 2 per dispute
- Every `delivery_confirmation_tokens.used_at IS NOT NULL` token has a corresponding `delivery_confirmations.buyer_acknowledged_delivery_at`
- Money status history is monotonically valid per `validate_money_transition`

## Execution & report

I will run the automated battery and produce `/mnt/documents/safedeal-test-report.md` with:
- Header: timestamp, accounts under test, environment
- Per-section table: scenario, status (✅ pass / ❌ fail / ⚠️ requires manual), expected, actual, evidence (SQL row counts, edge function status code, log excerpt)
- Issues summary at top (any failures elevated)
- Manual checklist at the end for the items that require browser interaction (Paystack, OTP SMS, file uploads, receipt print)
- Appendix: raw query outputs for dashboard reconciliations

If during execution I find a real bug, I will pause, report it, and ask whether to fix or note it and continue.

## Files
- Modify `.lovable/plan.md` (the test plan you're viewing) — append Sections E–L
- New `/mnt/documents/safedeal-test-report.md` — full executed report

## Risk
- Tests run on **live data**. All assertions are read-only or use new test accounts you create. No destructive writes.
- I cannot complete Paystack/OTP/email steps; those are clearly flagged as "manual" in the report rather than failed.
- For verification gating tests that require specific pre-states, I can only assert against existing accounts in the DB; if no account exists at the needed tier, that scenario will be marked "needs manual setup".

