## Goal

Polish `PayoutDetailDrawer.tsx` for the premium drawer look, make the **Eligibility checklist** a real DB-backed pre-release audit (every item pulled live; failing items clearly flagged), and rebuild the **Timeline** to use the same rich event renderer used on the Admin Dispute / Transaction detail pages — colored dots, titles, descriptions, actor, and time, instead of raw `event_type` strings.

No DB schema changes; all data already exists.

## File 1 — `supabase/functions/admin-payouts-detail/index.ts`

### 1. Eligibility gates — add `detail` and `actual`
Replace the existing `gates` block so each entry carries human-readable context the UI can render:

```ts
const gates = [
  { key: "money_pending_release", label: "Funds pending release",
    pass: tx?.money_status === "funds_pending_release",
    actual: tx?.money_status ?? "unknown",
    detail: tx?.money_status === "funds_pending_release"
      ? "Buyer payment is held in escrow and ready for release."
      : `Money status is "${tx?.money_status ?? "unknown"}". Must be 'funds_pending_release'.` },
  { key: "dispute_clear", label: "No active dispute",
    pass: !tx?.dispute_status || tx?.dispute_status === "resolved",
    actual: tx?.dispute_status ?? "none",
    detail: dispute && dispute.status !== "resolved"
      ? `Dispute ${dispute.id.slice(0,8)} is ${dispute.status}. Resolve before releasing.`
      : "No open dispute." },
  { key: "no_investigation", label: "No open investigation",
    pass: !investigationOpen && !tx?.needs_admin_review,
    actual: investigation?.status ?? (tx?.needs_admin_review ? "needs_admin_review" : "clear"),
    detail: investigationOpen
      ? `Investigation is ${investigation?.status} (priority: ${investigation?.priority ?? "n/a"}).`
      : tx?.needs_admin_review ? "Transaction is flagged for admin review."
      : "No active investigation." },
  { key: "payout_awaiting", label: "Payout awaiting release",
    pass: payout.status === "awaiting_release",
    actual: payout.status,
    detail: payout.status === "awaiting_release"
      ? "Payout is queued for release."
      : `Payout status is "${payout.status}".` },
  { key: "not_blocked", label: "Payout not blocked",
    pass: !payout.release_blocked,
    actual: payout.release_blocked ? "blocked" : "unblocked",
    detail: payout.release_blocked
      ? `Blocked: ${payout.payout_blocked_reason ?? "no reason recorded"}.`
      : "No admin block." },
  { key: "account_verified", label: "Seller payout account verified",
    pass: account?.verification_status === "verified",
    actual: account?.verification_status ?? "missing",
    detail: !account ? "Seller has not added a payout account."
      : account.verification_status === "verified" ? `${account.bank_name} ${maskAccount(account.account_number)} — verified.`
      : `Account ${maskAccount(account.account_number) ?? ""} is "${account.verification_status}".` },
  { key: "recipient_code", label: "Provider recipient code on file",
    pass: !!account?.provider_recipient_code,
    actual: account?.provider_recipient_code ? "present" : "missing",
    detail: account?.provider_recipient_code
      ? "Paystack recipient code present."
      : "Recipient code missing. Re-verify the bank account." },
  { key: "queue_open", label: "Release review queue active",
    pass: !!openQueue,
    actual: openQueue?.status ?? "absent",
    detail: openQueue ? `In '${openQueue.queue_type}' queue, status: ${openQueue.status}.`
      : "Transaction is not in the release review queue." },
  { key: "no_refund", label: "No in-flight refund",
    pass: !refundInFlight,
    actual: refundInFlight ? "in_flight" : "none",
    detail: refundInFlight
      ? `${(refunds ?? []).filter((r:any)=>["pending","processing"].includes(r.status)).length} refund(s) in flight.`
      : "No pending or processing refunds." },
];
```

### 2. New `timeline` array — same shape as `AdminCaseTimeline`
Build one merged, time-sorted array from the records already fetched (`events`, `money_status_history`, `dispute_status_history`, `payouts` lifecycle, `release_review_queue`). Each entry uses the `AdminTimelineEntry` shape: `{ id, at, type, title, description, actorType, actorName, severity, icon }`.

Add this builder inside the handler (after the existing parallel fetch, before the response), then include `timeline` in the JSON response next to `events`:

```ts
const [{ data: moneyHist }, { data: dispHist }] = await Promise.all([
  admin.from("money_status_history").select("id, from_status, to_status, reason, changed_at, changed_by_role").eq("transaction_id", payout.transaction_id).order("changed_at", { ascending: false }),
  admin.from("dispute_status_history").select("id, from_status, to_status, reason, changed_at").eq("dispute_id", dispute?.id ?? "00000000-0000-0000-0000-000000000000").order("changed_at", { ascending: false }),
]);

const tl: any[] = [];

(events ?? []).forEach((e: any) => tl.push({
  id: `evt-${e.id}`, at: e.created_at, type: "event",
  title: e.event_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
  description: e.event_data?.summary ?? e.event_data?.reason ?? null,
  actorType: e.actor_role, actorName: null, severity: "blue", icon: "activity",
}));

(moneyHist ?? []).forEach((m: any) => tl.push({
  id: `money-${m.id}`, at: m.changed_at, type: "money_status",
  title: `Money: ${m.to_status.replace(/_/g, " ")}`,
  description: `From ${m.from_status?.replace(/_/g, " ") ?? "—"}${m.reason ? ` — ${m.reason}` : ""}`,
  actorType: m.changed_by_role, severity: m.to_status === "funds_frozen" ? "red" : "blue", icon: "vault",
}));

(dispHist ?? []).forEach((d: any) => tl.push({
  id: `disp-${d.id}`, at: d.changed_at, type: "dispute",
  title: `Dispute: ${d.to_status.replace(/_/g, " ")}`,
  description: d.reason ?? (d.from_status ? `From ${d.from_status.replace(/_/g, " ")}` : null),
  severity: d.to_status === "resolved" ? "green" : "red", icon: "scale",
}));

// Payout lifecycle synth
if (payout.created_at) tl.push({ id: `pay-q-${payout.id}`, at: payout.created_at, type: "payout", title: "Payout queued", description: "Entered release review queue", severity: "blue", icon: "wallet" });
if (payout.initiated_at) tl.push({ id: `pay-i-${payout.id}`, at: payout.initiated_at, type: "payout", title: "Payout initiated", description: payout.provider_reference ?? null, severity: "blue", icon: "wallet" });
if (payout.released_at) tl.push({ id: `pay-r-${payout.id}`, at: payout.released_at, type: "payout", title: "Payout released", description: "Funds sent to seller", severity: "green", icon: "wallet" });
if (payout.status === "failed" && payout.failure_reason) tl.push({ id: `pay-f-${payout.id}`, at: payout.updated_at ?? payout.created_at, type: "payout", title: "Payout failed", description: payout.failure_reason, severity: "red", icon: "wallet" });

tl.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
```

Add `timeline: tl,` to the JSON response.

### 3. Service typing — `src/services/admin-payouts.service.ts`
Extend `PayoutEligibilityGate` with optional `detail?: string; actual?: string;` and add `timeline?: AdminTimelineEntry[]` (re-exported from the shared timeline component types, or duplicated locally).

## File 2 — `src/components/admin/payouts/PayoutDetailDrawer.tsx`

### 1. Header
Remove the raw payout UUID line above `Payout Details` title. Keep only the title and close button.

### 2. Hero amount card (unchanged structure)
Amount → currency caption → seller name → status pill. Failure / blocked reason centered beneath if present.

### 3. Seller information card (new — after hero)
Avatar from `detail.seller.avatar_url`, fallback to initial; name + email below. Standard slate-800 styling.

### 4. Eligibility checklist — DB-backed audit (replaces existing list)
Stop importing `PayoutEligibilityChecklist` here. Inline render with per-gate card:

```tsx
function ChecklistItem({ gate }: { gate: PayoutEligibilityGate }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      gate.pass ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
        gate.pass ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-red-500/15 text-red-400 border-red-500/30"}`}>
        {gate.pass ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-white text-sm font-medium leading-snug">{gate.label}</p>
          <span className={`text-[10px] uppercase tracking-wide font-semibold shrink-0 ${
            gate.pass ? "text-emerald-400" : "text-red-400"}`}>
            {gate.pass ? "Pass" : "Action needed"}
          </span>
        </div>
        {gate.detail && <p className="text-slate-400 text-xs mt-1 leading-snug">{gate.detail}</p>}
      </div>
    </div>
  );
}
```

Section header shows `{passed}/{total} ready` and a hint that all checks come live from the database.

### 5. Transaction details card (new)
Rows: Transaction code, Item, Status, Money status, Created. Standard slate-800 card.

### 6. Payout history card (new)
Rows: Initiated, Released, Attempts, Reason (red, when failed), Provider ref (mono).

### 7. Timeline — reuse `AdminCaseTimeline`
Replace the custom `<ul>` list with the shared component:

```tsx
import { AdminCaseTimeline } from "@/components/admin/timeline/AdminCaseTimeline";

<div className="space-y-3">
  <div>
    <h4 className="text-white font-semibold text-sm">Complete Transaction Timeline</h4>
    <p className="text-slate-400 text-xs mt-0.5">All events, status changes, and interventions</p>
  </div>
  <div className="bg-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto no-scrollbar">
    {(detail.timeline?.length ?? 0) === 0 ? (
      <p className="text-xs text-slate-400">No events recorded.</p>
    ) : (
      <AdminCaseTimeline
        items={detail.timeline as any}
        disputeStatus={detail.dispute?.status ?? null}
        resolvedAt={detail.dispute?.resolved_at ?? null}
      />
    )}
  </div>
</div>
```

Fallback (when the edge function hasn't been redeployed yet): if `detail.timeline` is missing, derive a minimal entry list inline from `detail.events` using the same shape so the component still renders.

### 8. Final section order
1. Hero amount card
2. Seller information
3. Eligibility checklist (DB-driven)
4. Pricing breakdown
5. Seller payout account
6. Transaction details
7. Payout history
8. Linked records
9. Complete Transaction Timeline (AdminCaseTimeline)
10. Actions (Release stays disabled while `!detail.eligibility.eligible`)

## Out of scope
- `PayoutEligibilityChecklist.tsx` and `AdminCaseTimeline.tsx` themselves (used as-is).
- No DB schema, RLS, or migration changes.
- Dialogs, routing, other payout components.
