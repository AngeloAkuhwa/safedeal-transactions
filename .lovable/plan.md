
# Fix: Buyer Stuck on "Pay Now" — Region Eligibility Mismatch (NOT a flow bug)

## Root cause (verified in DB)

The buyer payment flow is **NOT broken** and works the same for marketplace + private offers. What's blocking `angeloakuhwak@gmail.com` from clicking Pay:

| Field | Value |
|---|---|
| `state_name` | `Lagos` |
| `city_name` | `Lekki` ❌ |
| `is_region_eligible` | `false` |

`"Lekki"` is **not a valid Lagos LGA** in `serviceable_regions`. The real LGAs are `Eti-Osa` (Lekki Phase 1/Phase 2/VI) and `Ibeju-Lekki` (Sangotedo, Awoyaya). So `buyer-profile` correctly set `is_region_eligible=false`, and the Review/Pay pages correctly show the "region" lock banner — payment is blocked by design.

The "Pay Now" button is sitting behind: *"Protected transactions are only available in Lagos during launch — Update your location to a Lagos LGA in Profile Settings."* The user likely scrolled past that banner.

## Why other preseeded users feel "alive"

Preseeded users (`buyer@samplestore.test`, `seller@…`) have `city_name='Ajeromi-Ifelodun'` / `'Lagos'` with `is_region_eligible=true` (seeded directly, bypassing validation). So they sail through.

## The flow IS unified

Marketplace and private-offer buyers both hit the same gates in this order:
```text
/t/:shareToken (Review)  →  canPay check (buyer-profile.permissions)
       ↓ Pay clicked
/t/:shareToken/pay (Payment Summary)  →  same canPay check + agree-to-terms
       ↓
initiate-paystack-payment edge function  →  Gates 1–4 (verification, region, amount, concurrency)
       ↓ Paystack popup
verify-paystack-payment  →  payment_secured
```
No path divergence. The single difference is that private-offer transactions arrive at `/t/:shareToken` already locked-by-snapshot via `claim-offer`.

## Plan — two complementary fixes

### Fix 1 (immediate unblock): repair this user's profile data

One-shot SQL — set the buyer to a real, active Lagos LGA so `is_region_eligible` becomes true. We'll use `Eti-Osa` (which contains the Lekki area):
```sql
UPDATE profiles 
SET city_name = 'Eti-Osa', is_region_eligible = true 
WHERE id = 'd7e198dd-aabc-4bd5-b9b9-7fab57543359';
```

Then recompute their verification level via the existing `compute_verification_level` RPC so `basic_verified` sticks.

### Fix 2 (UX clarity): make the lock reason *louder* and *actionable inline*

Today the region lock banner sits at the top of the Pay page but the big "Pay" CTA in the right column shows the price label and is `disabled` — users don't always connect the two. We'll:

1. **`BuyerTransactionReview.tsx` → `NextActionCard`**: when `lockReason === "region"`, replace the disabled "Pay …" button with an enabled **"Update Location to Continue"** button that routes to `/dashboard/profile#location`. Same for `"verification"` and `"concurrency"` (already partially handled — make consistent).
2. **`BuyerPaymentSummary.tsx`**: do the same on the right-rail Pay button so the user can't just sit and wonder why the disabled button won't click.
3. Add a small `<a href="#location">` anchor target in `PersonalInfoSection.tsx` so the deep-link scrolls to the LGA selector.

### Fix 3 (data hygiene): block invalid stale values

The buyer's profile got into a `'Lekki'` state somehow (probably seeded or updated via an older free-text input). To prevent recurrence:
- Add a one-off migration that sweeps all `profiles` where `state_name`/`city_name` doesn't match an active row in `serviceable_regions` and force `is_region_eligible=false` (already the case here, but make it deterministic + log how many rows were touched).
- No schema change needed; the edge function already validates on update.

## Files touched

- **SQL migration** — repair the user's row + global re-validation sweep.
- `src/pages/BuyerTransactionReview.tsx` — `NextActionCard`: render an "Update Location" / "Verify Account" / "View My Transactions" CTA instead of the disabled Pay button when `lockReason` is set.
- `src/pages/BuyerPaymentSummary.tsx` — same pattern on the Pay summary right rail.
- `src/components/profile/PersonalInfoSection.tsx` — add `id="location"` anchor on the location card so `#location` deep-links scroll into view.

## Out of scope

- Adding "Lekki" to `serviceable_regions` as its own LGA — it isn't one.
- Changing the regional gate itself (intentional Lagos-only launch policy per `mem://constraints/regional-rollout`).
- Any change to the state machine, `claim-offer`, `transaction-agreement`, or Paystack flow — they're working correctly end-to-end.
