# Match Buyer/Seller cards to UX Pilot design

Scope: `src/pages/AdminDisputeDetail.tsx` only — the `PartyCard` component (lines ~858–965) and the two-column wrapper on line 542. Nothing else on the page or in the project is touched.

## 1. Wrapper breakpoint (line 542)

Change `grid grid-cols-1 lg:grid-cols-2 gap-6` → `grid grid-cols-1 xl:grid-cols-2 gap-6`.

Reason: at lg the global admin sidebar + right resolution sidebar squeeze the cards. Stacking until xl matches the design's tablet/medium-desktop behaviour and avoids the current broken layout.

## 2. PartyCard — replace `CardHeader` with a plain title row (kills the divider)

The current `CardHeader` atom forces `border-b border-border`, which is the horizontal line under "Buyer Information" / "Seller Information" the user wants gone. Stop using `CardHeader` inside `PartyCard` and instead render the title row as a normal flex inside the same `p-6` body.

New top-level structure inside the `Card` shell (still `rounded-xl border border-border bg-card`):

```
<Card>
  <div className="p-6">
    {/* 1. Title row — NO border */}
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-foreground">
        {isBuyer ? "Buyer Information" : "Seller Information"}
      </h2>
      <span className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        isBuyer ? "bg-blue-500/15 text-blue-400" : "bg-orange-500/15 text-orange-400",
      )}>
        {isBuyer ? "Buyer" : "Seller"}
      </span>
    </div>

    {/* 2. Identity row */}
    <div className="flex items-center gap-3 mb-5">
      <Avatar name={party.name} src={party.avatarUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-foreground truncate">{party.name ?? "—"}</div>
        <div className="text-sm text-muted-foreground truncate">User ID: {party.id?.slice(0, 16) ?? "—"}</div>
      </div>
      {/* trust signal: emerald Verified for buyer, yellow Gold Seller for seller */}
      {!isBuyer && sellerTier ? (
        <span className="inline-flex items-center gap-1 text-sm text-yellow-400 shrink-0">
          <Star className="h-4 w-4 fill-yellow-400" /> {titleCase(sellerTier)} Seller
        </span>
      ) : ver.identity ? (
        <span className="inline-flex items-center gap-1 text-sm text-emerald-400 shrink-0">
          <CheckCircle2 className="h-4 w-4" /> Verified
        </span>
      ) : null}
    </div>

    {/* 3. Details grid — single column on very small, 2 cols otherwise */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-5">
      <Field label="Email" value={party.maskedEmail ?? "—"} />
      <Field label="Phone" value={party.maskedPhone ?? "—"} />
      <Field label="Prior Disputes" value={party.priorDisputes != null ? `${party.priorDisputes} ${isBuyer ? "filed" : "received"}` : "—"} />
      <Field
        label={isBuyer ? "Account Status" : "Payout Status"}
        value={...colored value as today...}
      />
    </div>

    {/* 4. Primary action row */}
    <div className="flex gap-2">
      <Button size="sm" disabled className={cn("flex-1 gap-1.5 h-10 rounded-lg", callBtnCls)}>
        <Phone className="h-4 w-4" /> Call
      </Button>
      <ContactBtn className="flex-1 h-10 rounded-lg" icon={<Mail className="h-4 w-4" />} label="Email" disabled tip="..." />
      <Button size="sm" variant="outline" className="h-10 w-10 p-0 rounded-lg" onClick={...} aria-label="Profile">
        <UserIcon className="h-4 w-4" />
      </Button>
    </div>

    {/* 5. ONLY internal divider, then secondary action row */}
    <div className="mt-5 pt-5 border-t border-border">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button size="sm" variant="outline" className="gap-1.5"> <UserIcon className="h-3.5 w-3.5" /> View Profile </Button>
        <Button size="sm" variant="outline" className="gap-1.5"> <Scale  className="h-3.5 w-3.5" /> Dispute History </Button>
        <Button size="sm" variant="outline" className="gap-1.5"> <Clock  className="h-3.5 w-3.5" /> Transactions </Button>
      </div>
    </div>
  </div>
</Card>
```

`Field` is rendered inline (or reusing `KV`) with: label `text-sm text-muted-foreground` (regular weight, drop the uppercase `[11px]` style for this card to match UX Pilot), value `text-sm text-foreground` (drop the `truncate` on the value so masked emails/phones fully show; let the outer card width handle overflow).

The `flagged` red pill (today rendered next to the trust badge) is dropped from this card — the UX Pilot identity row shows only the single trust signal. Flag information remains visible elsewhere on the page.

`ContactBtn` is extended (one optional `className` prop) so the Email button can take `flex-1 h-10 rounded-lg` — it currently hardcodes its layout.

## 3. Button sizing

- Primary row buttons (`Call`, `Email`, profile square): `h-10 rounded-lg`, equal flex.
- Secondary row buttons: keep `sm` size, `rounded-lg`, `text-xs`-ish via existing `sm` variant; on `<sm` widths they stack via `grid-cols-1 sm:grid-cols-3`.

## 4. Out of scope

Header strip, summary strip, Financial Overview, Locked Agreement, Buyer Claim, Seller Response, Case Communication, Timeline, right Resolution sidebar, AdminLayout sidebar, any service / SQL / RLS / route change. The shared `Card` and `CardHeader` atoms keep their current behaviour for every other section on the page — only `PartyCard` stops using `CardHeader`.

## Verification

- Reload `/admin/disputes/:id` at ≥1280px: buyer + seller side by side, no line under either title, identity row flows directly under title, single thin divider sits above the bottom 3-button row, buyer Call blue / seller Call orange, square profile button to the right of Email, both card heights match.
- 1024–1279px (current preview viewport 1096px): cards stack full-width, no squeeze, no clipped buttons, no horizontal scroll.
- ≤640px: details grid collapses to one column, secondary row stacks to full-width buttons.
- Other sections on the page render unchanged (diff confined to the wrapper line 542 and the `PartyCard` function body).
