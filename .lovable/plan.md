

# Revised Fee Model + Checkout Design Refinements

## Fee Model Analysis and Recommendation

### Current Problem

The current model caps the **total** buyer fee (Paystack + Platform) at ₦2,000. This creates two issues:

1. **No minimum**: A ₦1,000 item charges only ₦39 — not enough to cover operations
2. **Zero SafeDeal revenue at cap**: When Paystack's fee alone reaches ₦2,000 (around ₦127,000+), SafeDeal earns ₦0

### Proposed New Model

Your instinct is right. Here is a clean structure:

```text
Buyer pays:  SafeDeal Protection Fee (single line to buyer)
             = Paystack processing cost + SafeDeal operations fee

Rules:
  1. Paystack fee: 1.5% + ₦100 (waived <₦2,500), capped at ₦2,000
  2. SafeDeal operations fee: max(₦250, tierRate × itemAmount - paystackFee)
     - ₦250 minimum ensures SafeDeal always earns at least ₦250
     - Uncapped (SafeDeal's cut is NOT subject to the ₦2,000 cap)
  3. Total Protection Fee = paystackFee + safedealOperationsFee
     - Paystack portion capped at ₦2,000
     - SafeDeal portion floored at ₦250, no upper cap
  4. Fee is non-refundable
```

### Example Calculations

| Item Price | Paystack Fee | SafeDeal Ops Fee | Total Fee | SafeDeal Profit |
|-----------|-------------|-----------------|-----------|----------------|
| ₦1,000 | ₦15 | ₦250 (floor) | ₦265 | ₦250 |
| ₦5,000 | ₦175 | ₦250 (floor) | ₦425 | ₦250 |
| ₦10,000 | ₦250 | ₦250 (floor) | ₦500 | ₦250 |
| ₦50,000 | ₦850 | ₦1,100 | ₦1,950 | ₦1,100 |
| ₦100,000 | ₦1,600 | ₦2,300 | ₦3,900 | ₦2,300 |
| ₦500,000 | ₦2,000 (cap) | ₦15,500 | ₦17,500 | ₦15,500 |
| ₦1,230,000 | ₦2,000 (cap) | ₦33,670 | ₦35,670 | ₦33,670 |

**Wait** — those high-value fees look too steep. A ₦35,670 fee on a ₦1.23M item is 2.9%, which may scare buyers. That matches the reference image (₦12,300) more closely if we keep a total cap.

### Alternative: Keep total cap but add SafeDeal minimum

```text
  Total Protection Fee = min(totalCap, paystackFee + platformFee)
  Where:
    - platformFee = max(₦250, tierRate × item - paystackFee)  (SafeDeal's cut, floor ₦250)
    - totalCap = ₦2,500 (raised from ₦2,000 to guarantee SafeDeal ₦500 at cap)
    - paystackFee capped at ₦2,000 (Paystack's own cap)
```

| Item Price | Paystack | Platform | Total Fee | SafeDeal Gets |
|-----------|---------|---------|-----------|--------------|
| ₦1,000 | ₦15 | ₦250 | ₦265 | ₦250 |
| ₦5,000 | ₦175 | ₦250 | ₦425 | ₦250 |
| ₦50,000 | ₦850 | ₦1,100 | ₦1,950 | ₦1,100 |
| ₦100,000 | ₦1,600 | ₦2,300 | ₦2,500 (cap) | ₦500 |
| ₦500,000 | ₦2,000 | ₦15,500 | ₦2,500 (cap) | ₦500 |
| ₦1,230,000 | ₦2,000 | ₦33,670 | ₦2,500 (cap) | ₦500 |

This keeps fees buyer-friendly (max ₦2,500) while guaranteeing SafeDeal always earns at least ₦250, and at least ₦500 when the cap kicks in.

**I recommend this approach** — it protects your revenue without shocking buyers on high-value purchases.

## Files to Modify

### 1. `src/lib/pricing.ts` + `supabase/functions/_shared/pricing.ts`
- Add `MIN_PLATFORM_FEE = 250` constant
- Raise total cap from `2000` to `2500`
- Platform fee calculation: `max(250, tierRate × item - paystackFee)`
- Total: `min(2500, paystackFee + platformFee)`
- Add `is_capped` and `is_floored` boolean flags to `PricingResult`
- Add `non_refundable: true` flag

### 2. `src/pages/StorefrontCheckout.tsx` — Design fixes to match reference
- Add subtitle "Review your order details and confirm payment" under heading
- Add delivery scope text (e.g., "Lagos & Abuja metropolitan areas") from `product.delivery_scope`
- Add seller transaction count and star rating display
- Show "Non-refundable" notice next to Protection Fee
- Show "(min)" badge when floor kicks in, "(capped)" when cap kicks in
- Update trust card text to match reference: "Funds held in secure escrow until you confirm receipt"
- Update terms text to match: "By confirming, you agree to..."

### 3. `src/pages/BuyerPaymentSummary.tsx`
- Add "Non-refundable" notice next to fee line for consistency

### 4. `supabase/functions/storefront-checkout/index.ts`
- Will automatically use updated `computePricing` from shared module

## No database changes needed.

