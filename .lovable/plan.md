# Scope Buyer/Seller Messages to real, dispute-bound data only

## Problem
Seller Messages tab currently renders 5 hardcoded demo messages via `buildSellerSeed(...)`. Buyer tab is a placeholder. None of it is real. Shipping requires zero invented content — every message must trace to an actual DB row tied to THIS `dispute_id` + `transaction_id` + buyer + seller.

## Source of truth (already fetched, already scoped)
`supabase/functions/admin-transaction-detail/index.ts` filters all of these by `dispute_id`, and the dispute itself is filtered by `transaction_id`:
- `dispute.description` — buyer's original claim (authored by the buyer of this transaction).
- `dispute_responses` — seller responses for this dispute.
- `dispute_evidence` — rows with `submitted_by_role` ('buyer' | 'seller'), optional `notes`, and a resolved file title.
- `dispute_internal_notes` — already wired to the Internal Notes tab.

No general dispute-messaging table exists, so these are the only authentic communications surfaceable today.

## Changes — frontend only, `src/pages/AdminDisputeDetail.tsx`

### 1. Delete all fake content
- Remove `buildSellerSeed(...)` and every call site.
- Remove the `agentName` placeholder and any other invented strings (no "SafeDeal Support" labels unless they come from a real record).

### 2. Pass real records into `CaseCommunicationSection`
At the existing call site, add props sourced from the already-loaded payload:
- `buyerClaim` = `{ text: dispute.summary, at: dispute.openedAt, buyerName: parties.buyer?.name }` — only included when both `text` and `parties.buyer` exist.
- `sellerResponses` = `dispute.responses ?? []` → `{ id, number, text, at }`.
- `disputeEvidence` = `evidence ?? []` already on page, each item has `uploadedByRole`, `notes`, `title`, `id`, `uploadedAt`.

### 3. Build messages from real records
- **Buyer Messages tab** (union, sorted by timestamp asc):
  - 1 `buyer_reply` message if `buyerClaim` exists. `msgRef=CLAIM-${dispute.id.slice(0,4).toUpperCase()}`, sender = `parties.buyer.name`, recipient = "SafeDeal Admin", body = `dispute.summary`, footer = "Filed via dispute form".
  - One message per `disputeEvidence` row where `uploadedByRole === 'buyer'` AND (`notes` non-empty OR `title` exists). Body = notes (or `Uploaded evidence: {title}` fallback). One attachment chip with the file title. `msgRef=EV-${id.slice(0,4).toUpperCase()}`.
- **Seller Messages tab** (union, sorted asc):
  - One `seller_reply` message per `dispute_responses` row. `msgRef=RES-${number}`, sender = `parties.seller.name`, recipient = "SafeDeal Admin", body = `response_text`, footer = "Submitted via dispute response".
  - One `seller_reply` message per `disputeEvidence` row where `uploadedByRole === 'seller'` AND (`notes` non-empty OR `title` exists). Same shape as buyer evidence message.
- **Internal Notes tab** — unchanged (already real `dispute_internal_notes`).

### 4. Empty states (no fabrication)
When a tab has zero real records, render the existing `text-slate-400 text-sm py-6 text-center` line:
- Buyer: "No buyer messages yet for this dispute."
- Seller: "No seller messages yet for this dispute."
- Internal: existing "No internal notes yet."

### 5. Status row chips
Drive each chip from real signals only — `dispute.responses.length > 0` (Buyer Responded / Seller Responded), `dispute.overdue` (Seller Overdue), `evidence.some(e=>...)` (Evidence Requested), etc. If a signal can't be derived from real data, hide that chip rather than show a fake state.

### 6. Composer / Quick Actions
- Internal Note tab still calls `onAddNote` (real persistence).
- Buyer/Seller Send buttons are disabled with tooltip "Outbound messaging not yet wired" — we will NOT fabricate sent messages. (Removing the controls entirely is also acceptable; disabling preserves the design.)
- Quick Action chips that would require non-existent endpoints are disabled the same way.

### 7. Guarantees
Every rendered row comes from a record already filtered by `dispute_id`; the dispute is filtered by `transaction_id`; sender names come from `parties.buyer` / `parties.seller` of THIS transaction. No cross-dispute, cross-transaction, or invented data can appear.

## Files touched
- `src/pages/AdminDisputeDetail.tsx` (remove seed, add props, real mapping, real chip logic, disable non-functional send/quick-actions).

No backend, schema, edge function, or service-layer changes — payload already contains everything needed.

## Acceptance
- No `buildSellerSeed`, no "MSG-147" style fake IDs, no hardcoded names or timestamps anywhere in the section.
- A dispute with 0 seller responses and 0 seller evidence shows the seller empty state.
- A dispute with real seller responses shows exactly those rows, with `RES-{n}` references and real `submitted_at`.
- Buyer claim + buyer evidence appear in the Buyer tab with the real buyer name.
- Internal Notes tab unchanged.
- Status chips reflect actual DB state; non-derivable chips are hidden.
- Send / Quick Actions that would write fake messages are disabled.
