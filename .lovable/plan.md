## Goal
Rebuild `/admin/transactions/:transactionId` to match the approved desktop and mobile references exactly, fix money/escrow display, surface dispute evidence near the top, and add a read-only Locked Agreement preview and Dispute Evidence preview — all driven by real backend data.

## Files to change
- `src/pages/AdminTransactionDetail.tsx` — full structural rebuild + money formatting + new sub-sections
- `src/components/admin/transactions/AgreementPreviewDialog.tsx` — NEW. Read-only locked agreement modal with watermark, no download/print
- `src/components/admin/transactions/EvidencePreviewDialog.tsx` — NEW. Read-only image/video/document/PDF preview, no download/print
- `src/components/admin/transactions/MoneyStatus.ts` — NEW small util mapping money_status → label/tone (Held / Frozen / Awaiting Release / Releasing / Released / Refund Pending / Refunded)
- `supabase/functions/admin-transaction-detail/index.ts` — extend response to include `evidence[]` (typed media list with secure preview URL, uploader, status, notes), `lockedAgreement` snapshot block, and ensure frozen amount + ledger are returned as numeric NGN. No money math changes.
- `src/services/admin-transaction-detail.service.ts` — extend types: `AdminTxEvidenceItem`, `AdminTxLockedAgreement`. Currency stays NGN.

No DB migration required. No edge function logic change beyond shaping/aggregation already available from existing tables (`disputes`, `dispute_evidence`, `files`, escrow ledger, agreement snapshot JSONB).

## Page structure rebuild

### Desktop order (top → bottom)
1. Sticky admin header (back, title, subtitle, state-aware Investigate / Unfreeze / Manage Dispute / overflow)
2. High-risk alert banner — only when risk level is high/escalated OR money_status=funds_frozen OR dispute open+overdue
3. Transaction Summary card (see §Summary fixes)
4. Locked Agreement preview card with **Preview Agreement** button
5. Dispute Evidence & Media — only when evidence/dispute/delivery proof exists. Sits HIGH on the page intentionally.
6. Dispute Status — only when dispute exists
7. Risk & Investigation
8. Complete Transaction Timeline (compact, see §Timeline fixes)
9. Linked Records
10. Items
11. Pricing & Fees
12. Payment & Escrow (grouped into one section, two columns)
13. Payout
14. Delivery & Fulfillment
15. Admin Notes / Audit Trail

On `xl+` screens use a 2-col layout for sections 7–14: left rail = Risk, Timeline, Items, Pricing, Payment & Escrow, Payout, Delivery; right rail = Dispute Status (sticky), Linked Records, Quick Actions, Admin Notes summary.

### Mobile order
1. Compact top bar (back, brand mark, overflow)
2. Header strip (txn code + item title + status pills incl. Overdue)
3. High-risk alert
4. Transaction Summary card (mobile layout: 2-col primary, parties stacked, 2×2 status grid)
5. Quick Actions card
6. Locked Agreement preview card (button opens read-only drawer)
7. Dispute Status accordion
8. Dispute Evidence accordion
9. Timeline accordion
10. Linked Records accordion
11. Transaction Details accordion (Item, Agreement totals, Shipping)
12. Payment & Escrow accordion
13. Delivery accordion
14. Sticky bottom action bar (`Take Action` + ⋮)

## Money display fixes
- All amounts route through `formatMoney(value, "NGN")` → always 2 decimals, ₦ prefix.
- Remove every `$` and any `formatMoneyCompact` use on this admin page.
- Map `money_status` to label using new util:
  - `funds_held_in_escrow` → "Held in Escrow"
  - `funds_frozen` → "Funds Frozen"
  - `funds_pending_release` → "Awaiting Release"
  - `funds_releasing` → "Releasing"
  - `funds_released` → "Released"
  - `refund_pending` → "Refund Pending"
  - `refund_issued` → "Refunded"
- Summary card primary escrow tile rules:
  - if `money_status === funds_frozen` → label "Funds Frozen in Escrow", value = `escrow.frozenAmount` (or buyerTotal if frozen amount is 0 and ledger shows frozen entry)
  - else if `funds_held_in_escrow` → label "Held in Escrow", value = `escrow.heldAmount`
  - else if released → label "Released", value = `escrow.releasedAmount`
  - else fall back to current state amount
- Escrow card always shows full breakdown: Held, Frozen, Released, Refunded, Last Changed.
- Linked Records "ESCROW" tile reflects the same active state and value (never "Frozen ₦0.00").

## Summary card fixes
Three rows, in this exact composition:

Row 1 (5 cells):
- Transaction (code + created)
- Last activity (relative + absolute)
- Total Charged (`pricing.buyerTotal`)
- Payment provider (`payment.provider` + masked reference)
- Payout Status (`payout.status` or "—")

Row 2 (parties, 2 cells): Buyer | Seller — avatar, name, masked contact, verified shield, flagged chip.

Row 3 (status, 6 cells): Transaction Status, Money Status (mapped label), Item Total, Protection Fee, Total Charged, **Active Escrow Value** using rule above.

Row 4 (action bar): Export Data, Open Investigation, Freeze/Unfreeze (state-aware), Manage Dispute (if dispute), overflow.

## Locked Agreement section
- Card showing: locked-at timestamp, txn code, buyer, seller, item title/desc/condition/qty, agreed price, protection fee, total, delivery method, verification window, seller notes, buyer notes (if any), dispute/cancel rules (if any), agreement hash/version (if any).
- Primary button: **Preview Agreement** → opens `AgreementPreviewDialog` (modal on desktop, drawer on mobile).
- Preview dialog rules:
  - read-only badge in header
  - large watermark "SafeDeal Admin Review Only" + transaction code, repeating diagonal
  - no download / no print buttons
  - `onCopy`, `oncontextmenu`, `Ctrl+P` intercepted and blocked at the dialog root
  - `window.print` no-op while open
  - scroll only
- If agreement snapshot missing → show banner: "Agreement snapshot missing. Review this transaction for data integrity."

## Dispute Evidence & Media
- New high-position section. Renders when any of: dispute exists, evidence list non-empty, delivery proof files exist.
- Backend returns `evidence[]` items with: `id, kind (image|video|document|receipt|delivery_proof|screenshot), title, secureUrl, mimeType, uploadedByRole, uploadedByName, uploadedAt, status (pending|reviewed|verified|rejected|flagged), note`.
- Card grid (1-col mobile, 2-col tablet, 3-col desktop). Each card:
  - thumbnail for image/video; file-type icon for document/receipt
  - title, kind badge, uploader + role, timestamp, status pill
  - actions: **Preview**, **Mark Reviewed**, **Flag Suspicious**, **Add Note** (gated by `adminCan.canReviewEvidence` etc.)
  - never: delete, replace, edit, download, print
- Preview dialog uses signed/secure URL only. Unsupported types show metadata + "Preview unavailable".
- All review actions logged via existing `admin-transaction-actions` edge function (new `evidence_reviewed`, `evidence_flagged`, `evidence_note_added` action types).

## Risk & Investigation fixes
- Always derive a synthesized flag set even when `risk.flags` is empty:
  - if `money_status === funds_frozen` → "Funds frozen"
  - if dispute open → "Dispute open"
  - if dispute overdue → "Dispute response overdue"
  - if `pricing.buyerTotal` over high-value threshold → "High-value transaction"
  - if buyer flagged → "Buyer account flagged"
  - if conflicting evidence detected → "Evidence conflict"
- Show synthesized flags alongside backend ones.
- Investigation log shows admin notes + escalation history + system risk events. Empty-state copy: "No admin notes yet. Risk flags were generated automatically from transaction state." with **Add note** button.

## Linked Records fixes
Cards: Buyer Profile, Seller Profile, Payment, Escrow, Payout, Dispute, Evidence Files, Locked Agreement, Delivery Proof. Each shows type, label, status, amount where relevant, click action.

- Payout when missing & dispute pending → "No payout yet / Pending dispute resolution" (opacity 60, not greyed-out broken).
- Escrow card reflects active state per money_status mapping (e.g. "Frozen ₦676,000.00" not "Frozen ₦0.00").
- Evidence Files card opens the Dispute Evidence section (scroll-to + highlight).
- Locked Agreement card opens preview dialog.

## Timeline fixes
- Default render: latest 8 events, newest-first.
- Toolbar: filter chips (All, Payment, Escrow, Delivery, Dispute, Admin, Money) + sort toggle (newest/oldest) + **Show full timeline**.
- Group events sharing the same timestamp under one node with a sub-list.
- Each event keeps icon, title, short description, actor, timestamp, money/state impact tag.

## Payment, Escrow, Ledger consistency
- Payment card: Provider, Status, Amount (NGN), Method, Reference, Paid at.
- Escrow card: State (mapped label), Held, Frozen, Released, Refunded, Last Changed.
- Ledger table unchanged structure but values formatted via `formatMoney`. If ledger shows a freeze entry equal to buyerTotal, summary tile reflects that as the frozen amount.
- Add a sanity check: if `escrow.frozenAmount === 0` but `money_status === funds_frozen` and the ledger has a frozen entry, derive the displayed frozen amount from the most recent frozen ledger entry. This prevents the "₦0.00 while frozen" defect without backend changes.

## State-aware actions
- Header + summary action row only shows what makes sense for current state:
  - frozen → Unfreeze (not Freeze)
  - dispute exists → Manage Dispute
  - high risk → Investigate
  - no payout → never show "Release Payout" anywhere
- Wording stays neutral: "Awaiting Release", "Pending Resolution", "Pending Review". No "admin will release" copy.

## Visual density
- Max content width 1440px.
- Card padding: `p-5 lg:p-6` desktop, `p-4` mobile.
- Section spacing: `space-y-5 lg:space-y-6`.
- Two-column layout used only on `xl+` for the lower stack as described above.
- Long supporting blocks (Ledger, Audit Trail, full Timeline) are collapsible.

## Backend (admin-transaction-detail edge function)
Add to response (no DB schema changes; reads existing tables):
- `lockedAgreement`: `{ lockedAt, txnCode, buyer, seller, item:{title, description, condition, quantity}, agreedPrice, protectionFee, total, deliveryMethod, verificationWindowHours, sellerNotes, buyerNotes, rules, hash, version }` from the agreement JSONB snapshot stored at payment time.
- `evidence[]`: aggregated from `dispute_evidence` joined with `files` + `delivery_proof_files`. Each item exposes a **secure preview URL only** (signed Cloudinary URL or short-lived storage URL — never raw paths).
- Ensure `escrow.frozenAmount`, `escrow.heldAmount`, `escrow.releasedAmount`, `escrow.refundedAmount` are always present numerically.
- `risk.flags` always includes synthesized flags described above.

## Acceptance criteria mapped
- Exact desktop + mobile order ✅
- All money in NGN with 2 decimals, no `$` ✅
- Frozen funds shown clearly as frozen, not missing ✅
- Dispute status + evidence sit high on the page when dispute exists ✅
- Locked agreement preview is read-only, watermarked, no download/print ✅
- Evidence preview is read-only, no download/print ✅
- Timeline compact with full-view toggle ✅
- Risk/investigation reflects actual state, never "no activity" while frozen/disputed ✅
- Linked records useful and clickable ✅
- All values come from API; no UX-Pilot sample data ✅