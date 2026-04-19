

The user wants a genuine end-to-end test of the delivery + verification flow across all 5 phases, covering happy paths AND non-happy paths, with no errors hidden. This requires browser automation + DB inspection + edge function probing — all of which need default mode.

# Full E2E Test Plan — Delivery & Verification Flow

## Approach

I will drive the actual preview as a real seller and a real buyer in two sequenced sessions, exercising every variant we shipped. After each step I'll verify the result two ways: (1) what the UI shows on the *other* party's screen, (2) what the database actually persisted (via direct read queries). I will report every defect I find — no glossing.

## Pre-flight (read-only, no destructive)

1. Query DB to find suitable test transactions per delivery method (`courier`, `pickup`, `meetup`, `hand_delivery`) currently in `payment_secured` or `seller_preparing_delivery`. If none exist for a method, I'll note it and skip that variant rather than fabricate data.
2. Identify the seller + buyer accounts on those transactions and confirm the user is logged in as one of them in the preview. **I'll need the user to provide the second account's credentials** (or accept that I can only test the side they're logged into, with DB cross-checks for the other side).

## Test matrix

For each available delivery method, run the sequence below. If a step fails, capture the error, screenshot, relevant DB row, and edge function logs — then continue (don't abort the whole run).

### Sequence A — Happy path: dispatch → deliver → buyer confirms

1. **Seller dispatches** (`/seller/transactions/:id/update-delivery`)
   - Verify Phase 2 form renders method-specific fields.
   - Submit. Capture toast + new status.
   - DB check: `transactions.status`, `delivery_tracking_details.*`, `signature_name` (handoff code) for pickup/meetup, `transaction_events` row.

2. **Buyer view** (`/buyer/transactions/:id` and `/tracking`)
   - Verify Phase 3 `<InTransitBlock>` renders correct variant + data matches DB.
   - Verify Phase 4 `<DeliveryTermsCard>` shows locked terms.
   - For pickup/meetup: confirm handoff code visible and matches `signature_name`.

3. **Seller marks delivered**
   - Courier/hand_delivery: submit (optional evidence).
   - Pickup/meetup: enter the correct 6-digit code from step 2. Submit.
   - DB check: `delivered_at`, status flip, `handoff_code_verified` event for pickup/meetup.

4. **Buyer view post-delivery**
   - `<VerifyReceiptCTA>` visible with countdown.
   - Countdown deadline matches `delivered_at + verification_window_hours`.

5. **Buyer confirms receipt** (`/dashboard/transactions/:id/verify`)
   - Walk through confirmation.
   - DB check: status `completed`, money status `funds_released`, `transaction_status_history` row.
   - `<TransactionCompletionBanner>` renders **buyer_confirmed** variant on both sides.

### Sequence B — Non-happy paths (Phase 5 hardening)

For one pickup or meetup transaction:
- **Wrong handoff code** → seller submits "000000". Expect 400 "Handoff code does not match." Toast surfaces it. Status unchanged in DB.
- **Empty handoff code** → seller submits blank. Expect validation error before request fires.
- **Case sensitivity** → if code is e.g. "ABC123", try "abc123". Expect success (we documented case-insensitive comparison).

### Sequence C — Non-happy paths (general)

- **Missing required dispatch field** (e.g. courier with no tracking number) → expect form-level validation error.
- **Buyer opens dispute** instead of confirming → status `disputed`, money status `funds_frozen`. Note the dispute flow continuing is out of scope but I'll verify the entry transition works.
- **Direct edge function call** for `update-delivery-status` with a `deliver` action on a transaction not yet `seller_dispatched` → expect server-side state-machine rejection.

### Sequence D — Variants we cannot easily trigger live

- **Auto-release banner** (timeout path): cannot wait 72h. I'll verify by querying a transaction whose `delivered_awaiting_verification` is past its deadline (if any exist in DB) and inspecting the `completion_event` derivation logic in the edge function output via `supabase--curl_edge_functions`. If none exist, I'll only confirm the code path classifies correctly by tracing the function — flagged as not live-tested.
- **Dispute-resolved banner**: same approach — find an existing completed-via-resolved transaction or trace logic only.

## What I will report

A defect log table per sequence:

| # | Method | Step | Expected | Actual | DB / log evidence | Severity |

Plus a final summary: how many of the 5 phases passed cleanly, where the cross-party sync is solid, and the specific gaps that need a code fix.

## What I need from you before I start

One quick decision (only one — I won't pile on questions):

