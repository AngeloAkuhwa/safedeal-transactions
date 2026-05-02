# Phase N — Final Drift Cleanup

## Honest answer: Not 100% yet.

The end-to-end flow itself (state machine, escrow, dispute, delivery, payouts, courier validation, agreement lock, notifications) is structurally complete and was already covered in Phases A–M. A focused audit just now found **3 concrete drift points** on user-facing surfaces that violate the centralized `formatMoney` rule established in Phase M. These are small but real — they are exactly the kind of inconsistency the audit asks us to eliminate.

Everything else flagged in a fresh `rg` sweep is correctly scoped (admin pages, chart tooltips, date strings, or landing-page demo data).

---

## Gaps to fix

### 1. `src/components/disputes/AgreementSnapshotSection.tsx` (line 34)
The dispute agreement snapshot — shown to **both buyer and seller** during a dispute — uses `value.toLocaleString()` for money. This violates the 2-decimal rule on one of the most trust-critical surfaces in the product (the locked agreement seen during a dispute).

**Fix:** Replace the local money formatter with `formatMoney(amount, currencyCode)` from `@/lib/format`.

### 2. `src/components/landing/demo-data.ts` (lines 119, 123)
Demo helpers use `toLocaleString("en-NG")` with no decimals. These render in landing-page demo cards. Buyers/sellers landing here see money formatted differently from the rest of the app.

**Fix:** Route through `formatMoney` (with currency `"NGN"`) so the demo matches production formatting (₦12,500.00, not ₦12,500).

### 3. `src/pages/SellerOfferDetail.tsx` (lines 154–159) — date consistency
Uses raw `new Date(...).toLocaleString()` for timestamps while the rest of the app uses `formatDateTime`/`formatDate` from `@/lib/format`. Not a money issue, but causes locale-dependent date drift between this page and SellerTransactionDetail.

**Fix:** Replace with the shared `formatDateTime` helper.

---

## What is explicitly NOT in scope (already verified clean)

- **Courier dispatch enforcement** — `DispatchForm` + `SellerUpdateDelivery` already require courier name + tracking number before allowing transition to `seller_dispatched`. ✅
- **Status label registry** — `src/lib/status-labels.ts` covers transaction, money, escrow, payout, product, visibility, dispute, and verification labels. All major UI consumers refactored in Phases L–M. ✅
- **"Admin" terminology on user surfaces** — only remaining matches are inside `/admin/**` pages (correctly internal). ✅
- **State transitions** — happy path, dispute path, timeout path, and auto-transitions all wired through edge functions and history tables (Phases B–F). ✅
- **Dashboard ↔ transaction list reconciliation** — server-side aggregation via edge function (Phase G). ✅

---

## After Phase N

With these 3 edits applied, every user-facing money value in the app routes through `formatMoney` (2-decimal, currency-aware), every status label routes through the central registry, and every date on offer/transaction detail pages routes through `formatDateTime`. At that point the system is genuinely production-ready against the audit checklist — no remaining drift, no surface where buyer and seller see conflicting truth.

Approve to apply Phase N.
