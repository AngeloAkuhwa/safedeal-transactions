## Goal

Replace the `/admin/disputes/:id` redirect with a dedicated **Admin Dispute Detail** workspace that matches the attached "Dispute Details 2" reference. The page renders inside the existing `AdminLayout` (sidebar untouched), uses real data from existing services, and gates resolution actions through the existing admin-action pipeline. No DB changes, no new edge functions unless something proves unavoidable.

## Files

### New
- `src/pages/AdminDisputeDetail.tsx` — page shell + data orchestration.
- `src/components/admin/disputes/DisputeSummaryStrip.tsx` — 4-col header strip.
- `src/components/admin/disputes/DisputePartyCard.tsx` — buyer + seller card (one component, role-aware).
- `src/components/admin/disputes/DisputeFinancialCard.tsx` — financial overview & controls.
- `src/components/admin/disputes/DisputeClaimCard.tsx` — buyer claim + evidence grid.
- `src/components/admin/disputes/DisputeSellerResponseCard.tsx` — seller response card / empty state.
- `src/components/admin/disputes/DisputeCommunicationCard.tsx` — tabs: Buyer / Seller / Internal Notes (notes wired, message tabs show empty state + TODO until a backend exists).
- `src/components/admin/disputes/DisputeTimelineCard.tsx` — vertical timeline filtered to dispute-relevant events with dedupe by `(type,at,actor)`.
- `src/components/admin/disputes/DisputeInternalNotesCard.tsx` — list + Add Note (uses existing `addInternalNote`).
- `src/components/admin/disputes/DisputeLinkedRecordsCard.tsx` — quick links to txn/buyer/seller/payment/escrow/payout/audit.
- `src/components/admin/disputes/DisputeResolutionSidebar.tsx` — right sticky sidebar (Resolution Status + Resolution Actions).
- `src/components/admin/disputes/DisputeEvidenceThumb.tsx` + `DisputeEvidencePreviewDialog.tsx` (or reuse existing `EvidencePreviewDialog.tsx`).
- `src/components/admin/disputes/DisputeLockedAgreementCard.tsx` — read-only locked agreement view (no download/print/edit).
- `src/components/admin/disputes/dialogs/` — small dialogs for actions that need input (Request More Evidence, Assign Agent, Partial Refund, Partial Release, Close Without Resolution). Reuse `ActionConfirmDialog`, `ResolveDisputeDialog`, `InternalNoteDialog` where they already fit.

### New service
- `src/services/admin-dispute-detail.service.ts` — `getAdminDisputeFull(disputeId)` that:
  1. Fetches the dispute row (id, transaction_id, status, reason, description, opened_at, seller_response_due_at, resolved_at, assigned_admin_id if column exists) via Supabase.
  2. Calls existing `getAdminTransactionDetailFull(transaction_id)`.
  3. Returns `{ dispute, txDetail }`.
  Throws `DisputeNotFoundError` / `AdminAccessRequiredError` to drive UI states.

### Updated
- `src/App.tsx` — route `/admin/disputes/:id` now points to `AdminDisputeDetail`. Remove import of `AdminDisputeRedirect`.
- `src/pages/AdminDisputeRedirect.tsx` — delete.

## Layout

Inside the existing `AdminLayout` (sidebar stays exactly as-is):

```text
<main>
  <StickyHeader />               ← back arrow, title, subtitle, SLA badge, Print
  <div grid xl:grid-cols-[minmax(0,1fr)_360px]>
    <section min-w-0>            ← left workspace
      SummaryStrip
      Buyer + Seller cards (2-col on lg)
      FinancialCard
      LockedAgreementCard (if available)
      BuyerClaimCard
      SellerResponseCard
      CommunicationCard
      TimelineCard
      InternalNotesCard
      LinkedRecordsCard
    </section>
    <aside hidden xl:block sticky top-[header] h-[calc(100vh-header)] overflow-y-auto border-l>
      ResolutionSidebar
    </aside>
  </div>
  <MobileActionBar block xl:hidden />   ← primary "Take Action" + overflow
</main>
```

Tokens only: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `primary`, `destructive`, `accent`, plus existing badge tones in `lib/status-labels.ts`. Emphasis colors come from those tokens — no raw `slate-*` / `red-*` / `orange-*` classes.

## Behavior highlights

- **SLA / overdue badge** derived from `dispute.seller_response_due_at` and current time. Pulsing dot when overdue.
- **Status badge** uses `DisputeStatusBadge`; "Resolution Status" panel maps `dispute.status` → alert + Next Action per the spec.
- **Evidence thumbs** classify by `mimeType` (image / video / pdf / other). Click → preview dialog (read-only, metadata, no download unless `adminActionsAvailable.canDownloadEvidence === true`).
- **Locked agreement** rendered from `txDetail.lockedAgreement` only; no download/print/edit controls.
- **Communication tabs**: Internal Notes is fully wired via `addInternalNote` + existing notes list from `txDetail`; Buyer/Seller message tabs render empty state with `// TODO: wire when dispute_messages edge function exists` (no fake messages, no fake send).
- **Action gating**: Every Resolution Action button reads `txDetail.adminActionsAvailable` plus dispute/money state rules. Disabled buttons get a tooltip explaining why. Mapping:
  - Move to Under Review → `disputeRequestMoreInfo` style endpoint already in service? If not present, fall back to `addInternalNote` + `// TODO` and keep button disabled when no real endpoint exists.
  - Request More Evidence → `disputeRequestMoreInfo` (already exists).
  - Escalate Further → `escalateDispute`.
  - Mark High Risk → `flagForReview`.
  - Mark Fraud Watch → `flagForReview` with `category: 'fraud'` if supported, else disabled + TODO.
  - Refund Buyer / Release Funds to Seller / Partial Refund / Partial Release / Close Without Resolution → `resolveDispute` with the matching outcome enum. Partials require amount + reason; validated client-side against eligible amounts before submit.
  - Assign / Reassign Agent → disabled + TODO (no current service).
- **Refund/Release safety**: UI never flips state optimistically; awaits backend success then refetches via React Query invalidation.
- **PII**: emails/phones come pre-masked from `AdminTxParty`; surface as-is. `tel:`/`mailto:` links built only when raw value exists (currently only masked → buttons disabled with "No contact available" tooltip unless we already get raw values for admins; today we don't, so default disabled).
- **Loading**: skeletons mirroring the section layout. **Error**: clean panel with Retry + Back to Disputes. **Not found**: explicit empty state with Back to Disputes.

## Routing

```tsx
// App.tsx
<Route path="/admin/disputes/:id" element={<AdminDisputeDetail />} />
```

`AdminDisputeRedirect.tsx` deleted; its import removed.

## Out of scope

- DB schema changes, new edge functions, agent-assignment backend, dispute messaging backend, evidence download policy, mobile redesign of the sidebar itself.

## Acceptance check

After implementation: navigating from `/admin/disputes` row → opens new page (not transaction detail); sidebar unchanged with Disputes active; all 14 sections render with real data or proper empty/loading/error states; every resolution action either calls an existing service or is visibly disabled with a tooltip; layout holds at 1440 / 1280 / 1024 / 768 / 375 widths.
