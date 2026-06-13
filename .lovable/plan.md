
# Storefront / Marketplace stock visibility — root cause + fix plan

## What you're seeing

For the Air Jordan Retro 10 listing (`cdb185e5-…`):

| Field on DB row                    | Value          |
| ---------------------------------- | -------------- |
| `status`                           | `out_of_stock` |
| `stock_quantity`                   | 4              |
| `reserved_quantity`                | 4              |
| `available = stock - reserved`     | **0**          |

So the row really does have 0 sellable units. The marketplace and public storefront hide it (they filter `.eq("status","published")`), which is why buyers can't see it. That filter is correct — the bug is **why reserved_quantity is stuck at 4**, plus several **UI surfaces that lie about availability**.

### Root cause of reserved_quantity = 4

Open `awaiting_payment` transactions for this product:

```
2026-04-14 11:38  awaiting_payment   (never paid, never declined)
2026-04-14 11:42  awaiting_payment   (never paid, never declined)
2026-04-14 11:42  awaiting_payment   (never paid, never declined)
2026-06-13 10:59  awaiting_payment   (today's cart, still in checkout)
```

Each of those reserved 1 unit. **There is no job that releases reservations from stale `awaiting_payment` transactions** (`buyer-cart`, `cart-checkout`, `storefront-checkout`, `decline-transaction`, `verify-paystack-payment`, `paystack-webhook` only release on explicit decline / successful payment). So once a buyer abandons a checkout, the unit is reserved forever — exactly what happened here.

Result: real, sellable stock = 1 (4 raw − 1 truly-pending) but the system shows 0 because 3 reservations are zombies.

### UI surfaces that show the wrong number

These render raw `stock_quantity` instead of `available = stock_quantity − reserved_quantity`:

| File                                                       | What it shows                              |
| ---------------------------------------------------------- | ------------------------------------------ |
| `src/pages/SellerProductDetail.tsx` (status card + header) | "Stock: 4 remaining" when available is 0   |
| `src/components/storefront/SellerProductCard.tsx`          | "Qty: 4" / "In Stock" badge                |
| `src/components/storefront/ProductCard.tsx`                | "Out of Stock" only when raw stock = 0     |
| `src/components/marketplace/MarketplaceProductCard.tsx`    | "Out of Stock" only when raw stock ≤ 0     |
| `src/pages/PublicProductDetail.tsx`                        | "Only X left", qty stepper cap, Buy button |
| `src/components/storefront/UpdateStockModal.tsx`           | "Out of Stock" label uses raw stock        |

Net effect: even when reservations clear, the seller's own dashboard still shows numbers that don't match what cart-checkout will accept, and marketplace cards can show "In Stock" for items the buyer can't actually buy.

---

## Fix plan

### 1. Release zombie reservations (data + recurring job)

**a. One-off SQL** (via migration / insert tool) to release reservations for the 4 abandoned `awaiting_payment` txs older than 24 h:

```text
For each awaiting_payment tx older than 24h:
  - cancel the tx (status='expired', money_status='not_secured')
  - decrement products.reserved_quantity by the reserved qty
  - write product_inventory_logs row (change_type='release', reference=tx)
  - flip products.status back to 'published' if available > 0
```

**b. Recurring cleanup edge function** `cart-expiry-cleanup` (invoked by a scheduled cron, e.g. every 15 min):

* Finds `transactions.status='awaiting_payment'` with `created_at < now() - interval '24 hours'`.
* Runs the same release logic transactionally.
* Also deletes stale `cart_items` older than 7 days for hygiene.

This is the missing piece — without it, every abandoned checkout permanently bleeds stock.

### 2. Single source of truth for "available" in the UI

Add a tiny helper:

```text
src/lib/inventory.ts
  getAvailableQuantity(p) = max(0, (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0))
  getStockBadge(p) → { label, tone }  // "Out of Stock" | "Only N left" | "In Stock"
```

Then replace raw `stock_quantity` checks in:

* `SellerProductDetail.tsx` — status card "Stock" tile shows `available` with "(N reserved)" subtext; header badge derived from available.
* `SellerProductCard.tsx`, `ProductCard.tsx`, `MarketplaceProductCard.tsx`, `UpdateStockModal.tsx`, `PublicProductDetail.tsx` — use `getAvailableQuantity` for "Out of Stock", "Only N left", quantity-stepper cap, and disabled add-to-cart.

No DB/API changes — `reserved_quantity` is already returned on every product payload that includes stock.

### 3. Marketplace listing filter — keep as-is

`marketplace-products` and `public-storefront` already correctly filter by `status='published'` and the `auto_out_of_stock_status` trigger flips status when available reaches 0. After fix #1 stops the zombie reservations, products will reappear in the marketplace automatically.

### 4. Verification

1. Run the one-off cleanup → reload `/seller/storefront/cdb185e5-…`: status flips to **Published**, available shows 1 (or 4 if no other reservations remain).
2. Reload `/marketplace` (signed-out and as buyer) → the Air Jordan listing reappears.
3. Add the product to cart → "Available: N" decrements; abandon checkout for 24 h + cron tick → reservation auto-released, available restored.
4. Edit Product page: when reserved > 0, status tile reads e.g. **"Stock 1 available · 3 reserved"** instead of misleading "4 remaining".

## Out of scope

* No change to escrow, payouts, or payment engine.
* No schema changes to `products` (still uses `stock_quantity` + `reserved_quantity`).
* No redesign of any screen — only label/number corrections + one helper.
