## Problem

In Admin Dispute Detail → Case Communication, each `dispute_evidence` row renders as its own message card (e.g. `#EV-3D24`, `#EV-70E2`), so a single buyer claim with N supporting uploads becomes N+1 stacked cards. Evidence should appear as **attachment chips on the message it belongs to**, not as separate cards.

## Fix (frontend only — `src/pages/AdminDisputeDetail.tsx`, ~lines 1324–1410)

Rework buyer/seller message builders inside `CaseCommunicationSection`. No schema, service, or edge function changes.

### Buyer Messages
- Build the buyer claim card (`#CLAIM-xxxx`) from `dispute.summary` + `openedAt` as today.
- Group `buyerEvidence` by `(uploadedAt minute, uploadedByName)`. For each group, decide its owner card:
  - If a buyer claim exists AND the group's earliest `uploadedAt` is within ±2 minutes of `openedAt`, attach the whole group to the claim card.
  - Otherwise the group becomes **its own consolidated evidence card** (`#EV-xxxx` from the first item's id) with **all files in that group** as attachment chips on that single card.
- An evidence row's `note`, when non-empty and not duplicative of the body, is appended as a "Note: …" line on its owning card — never as a separate card.
- Result: each distinct buyer submission = one card carrying its own attachments. Multiple submissions still produce multiple cards, each with their own chips.

### Seller Messages
- For each `dispute_responses` row, render one `#RES-N` card as today.
- Group `sellerEvidence` the same way (per minute + uploader). For each group:
  - Attach to the response card whose timestamp window contains the group (between this response and the next, or within ±2 min of a response).
  - Otherwise render the group as its own consolidated `#EV-xxxx` card with all its files as chips.
- Same note-merging rule.

### Shared
- Attachment chip visual unchanged (paperclip + filename, current styling).
- Multiple chips wrap inside the card body (flex-wrap, gap-2) — design already supports this.
- Sort order, footer meta, `General Reply` chip, `Reply` row, and empty-state text unchanged.
- Internal Notes tab unchanged.

## Out of scope
- No backend / schema / edge function changes.
- No redesign of card chrome.
- No change to Buyer Claim / Seller Response sections above Case Communication.
