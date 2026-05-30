## Scope

Single file: `src/pages/AdminDisputeDetail.tsx`. No business-logic changes — only display strings and presentational classes on the cards rendered on the Admin Dispute Detail screen.

## Change 1 — Protection Fee caption

Currently the caption can read `"Capped at ₦2,500"` (when fee ≥ 2500) or `"Minimum ₦250 fee"` (when ≤ 250). Replace the wording so it always reads as a SafeDeal escrow percentage instead of a cap notice.

New rule for the caption under "Protection Fee":

- If `buyerTotal > 0` and `protectionFee > 0`: `"{rate}% escrow fee"` where `rate = ((protectionFee / buyerTotal) * 100).toFixed(1)` (e.g. `"3.9% escrow fee"`, `"2.5% escrow fee"`). This is the same effective rate SafeDeal already computes in `src/lib/pricing.ts` (tiered 3.9% → 2.5%, with the ₦2,500 cap baked into the resulting amount).
- Otherwise: no caption.

The wording "Capped at ₦2,500" and "Minimum ₦250 fee" is removed entirely from the UI. The cap still applies in pricing — we just stop surfacing it as label text.

## Change 2 — Unify card shape, color, and title typography

Make every card on the Dispute Detail screen visually match the Financial Overview & Controls card:

- Container: `rounded-[18px] border border-[#253044] bg-[#111827]/80 overflow-hidden min-w-0`
- Title block: `px-5 pt-5 pb-2 md:px-7 md:pt-6 md:pb-3`, no bottom border under the title
- Title text: `text-[20px] md:text-[24px] xl:text-[26px] leading-[26px] md:leading-[30px] font-semibold tracking-[-0.02em] text-[#F8FAFC]`
- Optional subtitle (when provided): `mt-1 text-[13px] md:text-[14px] leading-[18px] text-[#9CA3AF]`
- Body padding: keep current `p-6` inside each Card child as today (no spacing rewrite of the inner content).
- All existing titles stay in their current Title Case form ("Locked Agreement", "Buyer Claim", "Seller Response", "Case Communication", "Case Timeline", "Internal Notes & Investigation", "Linked Records & Quick Actions", "Buyer Information", "Seller Information"). No copy changes.

### How to apply

1. Update the local `Card` atom (line 68) so the `<section>` uses the Financial card classes above instead of `rounded-xl border-border bg-card`.
2. Update the local `CardHeader` atom (line 75) to drop the `border-b border-border` and use the Financial title/subtitle classes above.
3. Update `PartyCard` (lines 880 and 913): replace the inline `h2.text-lg font-semibold text-foreground` with the same Financial title classes so "Buyer Information" / "Seller Information" headings match the rest. Keep the role chip on the right.
4. Leave the Financial Overview section block itself untouched — its inline classes are already the source of truth.

## Out of scope

- No layout changes to the right-side Resolution sidebar (the user message is specifically about cards on the dispute detail screen body).
- No content/data, no badge, no button, no spacing-of-content changes inside each card body.
- No changes to pricing math or the underlying protection-fee calculation.

## Acceptance

- Protection Fee caption shows `"X.X% escrow fee"` and never shows the words "Capped" or "Minimum".
- Every card on the dispute detail screen body uses the same rounded `[18px]` shape, `#253044` border, `#111827/80` background, and the Financial Overview title typography. No remaining `rounded-xl` / `border-border` / `bg-card` card on this screen.
- All existing card titles remain in Title Case and are visually consistent in size and weight with "Financial Overview & Controls".
