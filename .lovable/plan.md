## Scope

Only `src/pages/AdminDisputeDetail.tsx`. No other files, no business logic changes.

## 1. Fix tablet/mobile scroll bug

Root cause: `AdminLayout` is mounted with `fullHeight`, which makes the `<main>` wrapper `h-screen overflow-hidden`. The inner content section currently sets scrolling only at `xl`:

```tsx
<div className="flex flex-col xl:flex-row xl:h-full xl:min-h-0">
  <section className="flex-1 min-w-0 xl:h-full xl:overflow-y-auto overflow-x-hidden">
```

Below `xl` (tablet/mobile), the content has no scroll container and the parent clips it — the page cannot scroll.

Fix: make the column flex layout fill the parent at all breakpoints and put the scroll on the content section and the sidebar at every breakpoint.

- Outer wrapper → `flex flex-col xl:flex-row h-full min-h-0`
- Content section → `flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden`
- Sidebar `<aside>` → `w-full xl:w-[380px] shrink-0 border-t border-border xl:border-t-0 xl:border-l min-h-0 overflow-y-auto bg-card` (drop the `xl:h-full xl:overflow-y-auto` gating so it scrolls on tablet/mobile too instead of fighting the parent)

This restores scrolling on tablet and mobile without affecting desktop.

## 2. Rebuild Financial Overview & Controls card

Replace lines ~539-591 (the existing `<Card>…</Card>` block for Financial overview). Keep the surrounding code (Buyer/Seller cards above, Locked Agreement below) untouched. Keep the existing data sources: `buyerTotal`, `amountInDispute`, `protectionFee`, `eligibleRefund`, `eligibleRelease`, `moneyStatus`, `moneyStatusLabel`, `payout`, `payoutLabel`, `resolvedAt`, `tx.createdAt`, `payment.method`, `refundedAmount`, and helpers `ngn`, `titleCase`. Use `whitespace-nowrap` only at `xl` so it wraps on small screens; never `overflow-x`.

New JSX skeleton (replaces the current `<Card>` for Financial overview):

```tsx
<section className="rounded-[18px] border border-[#253044] bg-[#111827]/80 overflow-hidden">
  <div className="px-5 py-5 md:px-8 md:py-7 border-b border-[#253044]">
    <h2 className="text-[22px] md:text-[26px] leading-[30px] md:leading-[32px] font-semibold tracking-[-0.02em] text-[#F8FAFC]">
      Financial Overview &amp; Controls
    </h2>
    <p className="mt-2 text-[16px] md:text-[20px] leading-[24px] md:leading-[28px] text-[#9CA3AF]">
      Money state and payout controls for this dispute
    </p>
  </div>

  <div className="px-5 py-6 md:px-8 md:py-8">
    {/* Row 1: 4 metrics */}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-12 gap-y-8">
      <FinMetric label="Total Transaction" value={ngn(buyerTotal)}
                 caption={payment?.method ? `Paid via ${titleCase(payment.method)}` : undefined} />
      <FinMetric label="Amount in Dispute" value={ngn(amountInDispute)} valueColor="#FB923C"
                 caption="Full amount disputed" />
      <FinMetric label="Protection Fee" value={ngn(protectionFee)}
                 caption={protectionFee > 0 && buyerTotal > 0
                   ? `${((protectionFee / buyerTotal) * 100).toFixed(1)}% escrow fee` : undefined} />
      <FinMetric label="Funds Status"
                 valueNode={(
                   <div className="mt-4 flex items-center gap-3" style={{ color: "#FACC15" }}>
                     <span className="h-4 w-4 rounded-full shrink-0" style={{ background: "#FACC15" }} />
                     <span className="text-[26px] md:text-[30px] xl:text-[34px] leading-[32px] md:leading-[38px] xl:leading-[40px] font-semibold tracking-[-0.03em] xl:whitespace-nowrap">
                       {moneyStatusLabel(moneyStatus)}
                     </span>
                   </div>
                 )}
                 caption={tx.createdAt
                   ? `Since ${new Date(tx.createdAt).toLocaleDateString("en-NG",
                       { month: "short", day: "numeric", year: "numeric" })}`
                   : undefined} />
    </div>

    <div className="my-8 md:my-10 h-px bg-[#253044]" />

    {/* Row 2: 3 metrics */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-16 gap-y-8">
      <FinMetric label="Eligible Refund Amount" value={ngn(eligibleRefund)} valueColor="#6EE7B7" />
      <FinMetric label="Eligible Release Amount" value={ngn(eligibleRelease)} valueColor="#60A5FA"
                 caption="After fees" />
      <FinMetric label="Payout Status"
                 valueNode={(
                   <div className="mt-4 flex items-start gap-3" style={{ color: "#F87171" }}>
                     <span className="mt-3 h-4 w-4 rounded-full shrink-0" style={{ background: "#EF4444" }} />
                     <span className="text-[26px] md:text-[30px] xl:text-[34px] leading-[32px] md:leading-[38px] xl:leading-[40px] font-semibold tracking-[-0.03em]">
                       {payoutLabel(payout, moneyStatus, !resolvedAt)}
                     </span>
                   </div>
                 )}
                 caption={!resolvedAt ? "Pending resolution" : undefined} />
    </div>
  </div>

  {/* Preserve existing inline alert strips (active-dispute / frozen / refunded) inside the card,
      moved here so they keep their semantics; restyled with px-5 md:px-8 instead of mx-5 */}
  {!resolvedAt && moneyStatus === "funds_pending_release" && (
    <div className="mx-5 md:mx-8 mb-5 md:mb-8 ...same as today...">…</div>
  )}
  {/* (and the other two existing alert blocks unchanged in copy) */}
</section>
```

`FinMetric` is a tiny file-local helper that renders:

```tsx
<div className="min-w-0">
  <p className="text-[16px] md:text-[20px] leading-[22px] md:leading-[26px] text-[#9CA3AF]">{label}</p>
  {valueNode ?? (
    <p
      className="mt-4 text-[26px] md:text-[30px] xl:text-[34px] leading-[32px] md:leading-[38px] xl:leading-[40px] font-semibold tracking-[-0.03em]"
      style={valueColor ? { color: valueColor } : undefined}
    >
      {value}
    </p>
  )}
  {caption && (
    <p className="mt-3 text-[14px] md:text-[18px] xl:text-[20px] leading-[20px] md:leading-[26px] xl:leading-[28px] text-[#9CA3AF] break-words">
      {caption}
    </p>
  )}
</div>
```

Default value color = `#F8FAFC`.

### Notes
- Drop the old `Card` + `CardHeader` + `FinStat` usages for this section only. `FinStat`, `moneyDotColor`, `moneyTextColor`, `payoutDotColor`, `payoutTextColor` stay in the file (still used elsewhere if any) — we just stop using them here.
- No `overflow-x-auto`, no `min-w-[...]`, no nested mini-cards, no table.
- Currency stays whatever `ngn()` formats today (Naira). No `$` introduced.
- Hex colors are intentionally inline per the spec to match the reference exactly; do not refactor into tokens in this pass.

## Acceptance

- Tablet (875px) and mobile preview can scroll the whole page vertically.
- Financial card matches the reference: large title/subtitle, 4-up then 3-up metric rows, single divider, yellow "Held in Escrow" with dot, red "Blocked (dispute active)" with dot, generous padding, no horizontal scrollbar, Naira values preserved.
- No other sections on the page change.
