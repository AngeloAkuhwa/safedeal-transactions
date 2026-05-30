## Scope

`src/pages/AdminDisputeDetail.tsx` only, Financial Overview & Controls section (lines ~539–609). No other sections touched.

## Changes

1. **Remove the horizontal divider line under the title.** Drop `border-b border-[#253044]` from the header `<div>` so the title block flows straight into the metrics with no rule beneath the heading. (The single divider between Row 1 and Row 2 stays — that's the only horizontal line in the reference.)

2. **Remove the subtitle entirely.** Delete the `<p>Money state and payout controls for this dispute</p>` line. Header becomes just the `<h2>`.

3. **Move payment source under Total Transaction.** Today `Paid via {method}` is only shown when `payment?.method` exists. Keep that, but make it always render a meaningful caption:
   - If `payment?.method` → `Paid via {titleCase(payment.method)}` (e.g. "Paid via Card", "Paid via Bank Transfer").
   - Else → `Payment source unavailable` muted, so the slot is never empty in the layout.

4. **Protection Fee caption reflects the system cap.** Replace the raw `${pct}% escrow fee` caption with cap-aware copy using the documented fee model (tiered 3.9%–2.5%, cap ₦2,500, floor ₦250):
   - Compute `pct = (protectionFee / buyerTotal) * 100` when `buyerTotal > 0`.
   - If `protectionFee >= 2500` → caption: `Capped at ₦2,500` (single line, muted).
   - Else if `protectionFee <= 250` → caption: `Minimum ₦250 fee`.
   - Else → caption: `${pct.toFixed(1)}% escrow fee · capped at ₦2,500`.
   - Wrap caption in `text-[#9CA3AF]` as today; do not introduce new colors.

5. **Tighten typography to match the screenshot more precisely** (text size cleanup only, no layout changes):
   - Title `h2`: keep `font-semibold tracking-[-0.02em] text-[#F8FAFC]`, sizes `text-[20px] md:text-[24px] xl:text-[26px]` with matching leading. (Slightly smaller than current to match reference proportions.)
   - Metric label: `text-[13px] md:text-[14px] leading-[18px] text-[#9CA3AF] font-normal`.
   - Metric value: `text-[22px] md:text-[26px] xl:text-[28px] leading-[28px] md:leading-[32px] font-semibold tracking-[-0.02em]` (was 26/30/34 — reduced so values don't wrap to 3 lines on tablet, which is the visible defect in the upload).
   - Metric caption: `text-[12px] md:text-[13px] leading-[18px] text-[#9CA3AF]`.
   - Funds Status / Payout Status value spans inherit the same value sizing as numeric metrics (so "Held in Escrow" and "Blocked (dispute active)" match the ₦ values visually); keep colored dot + colored text.
   - Header block padding reduced to `px-5 py-4 md:px-7 md:py-5` (no border-b) and body padding to `px-5 pb-6 pt-2 md:px-7 md:pb-8 md:pt-4` so the title sits closer to Row 1 like the reference.

6. **Keep all data sources, helpers, alert strips, and Naira formatting unchanged.** No business logic changes.

## Technical details

- `FinMetric` helper stays; only its className strings are updated to the sizes in step 5. Add an optional `captionMuted` styling only if needed — otherwise reuse current caption styles.
- No changes to `payoutLabel`, `moneyStatusLabel`, `ngn`, `titleCase`, or the data hooks.
- No changes to the outer scroll wrapper from the previous patch.

## Acceptance

- No horizontal rule directly under "Financial Overview & Controls".
- Subtitle line is gone.
- Total Transaction shows `Paid via …` (or fallback) on every dispute.
- Protection Fee caption explicitly mentions the ₦2,500 cap (or the ₦250 floor) rather than only a raw percentage.
- On the 875px tablet preview, no metric value wraps to three lines; "Held in Escrow" and "Blocked (dispute active)" no longer clip.
- Desktop layout still matches the reference (4-up row, divider, 3-up row).
