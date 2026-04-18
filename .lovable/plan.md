
# Batch 5 — Final Refined Spec (with lifecycle + routing corrections)

## What changes vs the previous plan

Adopting all 7 tightening points from the review. The biggest correction:

> **Transaction creation moves from seller-publish to buyer-resolver.**
> Publishing creates products + offer + offer_items only. The shared transaction is created lazily, on the buyer's first valid resolver hit.

---

## 1. Seller publish (lighter than before)

`SellerCreateTransaction.tsx` wizard → `create-transaction` edge fn `publish` action now does:

1. Insert N `products` rows (one per item, `visibility_type='buyer_specific'`, `slug='po-{token8}-{i}'`)
2. Link uploaded media to each product via `product_media`
3. Insert ONE `buyer_specific_product_offers` row (`status='pending_claim'` or `linked` if buyer email matches an existing account)
4. Insert N `buyer_specific_offer_items` with full snapshot (title, short_description, condition_summary, quantity, unit_price_snapshot, currency, primary_media_url)
5. Write `offer_events` (`created`)
6. Return `{ offer_url: '/offer/{token}', offer_id }` — **no transaction yet**

No dormant transactions. No skewed seller dashboard counts.

---

## 2. Resolver responsibility (locked & narrow)

`/offer/:offerToken` → `OfferClaimLanding.tsx` (thin) → calls `claim-offer` edge fn which does ONLY:

1. **Validate** token (exists, not cancelled, not expired)
2. **Identify** caller (signed-in match, anon, wrong account, signup-needed)
3. **Link** buyer if matches by email and `buyer_id` null
4. **Reuse-or-create** transaction (rules below)
5. **Redirect** to `/dashboard/transactions/:txId/agreement`

Nothing else. No payment work, no agreement work.

### Reuse-or-create rule (locked)
For one `(offer_id, buyer_id)` pair:

| Existing transaction state | Action |
|---|---|
| `draft`, `awaiting_buyer`, `awaiting_payment` | **Reuse** (return its id) |
| `cancelled`, `timed_out`, payment failed before hold | **Create new** |
| `payment_secured` or beyond | **Resume** → redirect to existing tx detail |

Guarantees: at most one live pre-purchase transaction per `(offer, buyer)`.

### Transaction creation (when needed)
- One `transactions` row with `source_offer_id`, `source_product_id` = first item, `seller_id`, `buyer_id`
- N `transaction_items` rows from `buyer_specific_offer_items` snapshots
- Status: `awaiting_buyer` (existing flow expects this before agreement acceptance)
- Write `offer_events` (`transaction_created`)
- Promote offer status: `linked` → `claimed`, set `claimed_at`

---

## 3. Offer lifecycle (sharper states)

Keep enum simple at DB level (`pending_claim`, `linked`, `expired`, `cancelled`, `claimed`, `purchased`) but add internal sub-states via timestamps:

| State | Trigger | Timestamp |
|---|---|---|
| `pending_claim` | Created, no buyer account match | `created_at` |
| `linked` | Buyer account exists/matched (auto-link or signup trigger) | `linked_at` |
| `claimed` | Buyer entered resolver successfully + transaction created | `claimed_at` |
| `purchased` | Payment hold succeeded (paystack-webhook) | `purchased_at` |
| `expired` | Past `expires_at`, no active tx | `expired_at` |
| `cancelled` | Seller cancelled | `cancelled_at` |

`claimed` ≠ `purchased`. Webhook is the only thing that flips to `purchased`.

---

## 4. Buyer journey (explicit)

```text
WhatsApp link → /offer/:token
       ↓ (resolver: validate → link → reuse-or-create tx)
/dashboard/transactions/:txId/agreement   ← existing page
       ↓ accept terms
/dashboard/transactions/:txId             ← existing review (now renders bundle items)
       ↓ pay
/t/:shareToken/pay                        ← existing payment
       ↓ webhook: hold success → offer.status='purchased'
/dashboard/transactions/:txId/tracking    ← existing tracking
```

Zero new buyer pages beyond the thin resolver.

---

## 5. Seller storefront visibility & edit rules (locked)

**Visible:** Private products show on seller's own storefront with a "Private" badge + "All / Public / Private" filter chip. Public marketplace + public storefront page still hide them (4-layer filter unchanged).

**Edit matrix:**

| Action | Before any claim | After claim (live tx exists) | After purchase |
|---|---|---|---|
| View product detail | ✅ read-only | ✅ read-only | ✅ read-only |
| Cancel offer | ✅ | ❌ (must cancel tx first) | ❌ |
| Regenerate token | ✅ | ❌ | ❌ |
| Duplicate offer (clone) | ✅ | ✅ | ✅ |
| Edit price / qty / agreement | ❌ (locked once published — managed via cancel+recreate) | ❌ | ❌ |

`SellerProductDetail.tsx` shows a banner: *"This is a private offer product. Manage it from your Private Offers list."* with link to `/dashboard/offers/seller/:offerId`.

---

## 6. Snapshot rules (locked)

`buyer_specific_offer_items` snapshots at publish time:
- `product_title`, `short_description`, `condition_summary`
- `quantity`, `unit_price_snapshot`, `currency_code`
- `primary_media_url`

Resolver uses these snapshots when creating `transaction_items` — never re-reads live `products` table. Offer truth stays stable across product cancellation/duplication.

---

## 7. Admin oversight (bundle-aware)

`/admin/offers/:offerId` shows:
- Header: seller, intended buyer email, linked buyer, status, expiry, current/previous tokens
- **Items list** (with snapshot + current product status)
- Linked transaction (if any) + payment + escrow state
- Claim/purchase history (claimed_at, purchased_at)
- Full `offer_events` audit trail

`/admin/offers` list adds an "Items" column showing item count.

---

## Build steps (delta)

### Database (small migration)
- New table `buyer_specific_offer_items` with snapshot columns
- Index `(offer_id)`, `(product_id)`
- RLS: inherits parent offer access (seller owns, buyer reads linked, admin reads all)
- Add `source_offer_id` confirmed on `transactions` (already added in earlier migration ✅)

### Edge functions
- **Modify `create-transaction`** publish step → drop transaction creation; create products + offer + offer_items + event only; return `offer_url` only
- **Modify `claim-offer`** → add reuse-or-create transaction logic with the locked rule table; promote status to `claimed`; return `redirect_to`
- **Modify `paystack-webhook`** → on hold success for `source_offer_id != null` → set offer `status='purchased'`, `purchased_at=now()`, write event
- **Modify `seller-products` LIST** → keep `buyer_specific` items in results, return `visibility_type` so UI can render badge
- **Modify `seller-offers`** → return offer with nested `items[]` array (snapshots) and live transaction summary

### Frontend
- **`SellerCreateTransaction.tsx`** → "Add another item" in step 2 (multi-item builder); rename CTA to "Create Private Offer"; update success modal to show only the offer link (primary)
- **`OfferClaimLanding.tsx`** → thin resolver: spinner → call `claim-offer` → `navigate(redirect_to)` with the 9-scenario error matrix preserved
- **`SellerStorefront.tsx`** → "Private" badge on cards where `visibility_type='buyer_specific'`; "All / Public / Private" filter chip
- **`SellerProductDetail.tsx`** → read-only banner + "Manage offer" link
- **Buyer review/agreement pages** → no changes needed; render N `transaction_items` (already supported)
- **`AdminOfferDetail.tsx`** → render bundle items list with snapshots

---

## Success criteria
- ✅ No dormant transactions at seller publish
- ✅ One live pre-purchase transaction per `(offer, buyer)` enforced
- ✅ Buyer lands on existing agreement page; reuses entire post-agreement flow
- ✅ Multi-item bundles work end-to-end (one link → one transaction → many items)
- ✅ Private products visible to seller (badge), hidden from public (4 layers)
- ✅ Seller cannot edit private products mid-flow
- ✅ Snapshots make offer truth stable across product changes
- ✅ Admin sees full bundle + audit traceability
- ✅ Lifecycle states cleanly separate `claimed` (entered flow) from `purchased` (payment held)

Reply **"Approved"** to implement.
