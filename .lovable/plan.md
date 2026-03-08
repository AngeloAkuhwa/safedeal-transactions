

# Seed Additional Data for Buyer Dashboard Visibility

## Current State

The database already has solid seed data:
- 3 users (buyer Tunde, seller Chioma, admin)
- 6 transactions across all lifecycle stages
- 6 transaction items + 6 pricing records
- 5 payments, 5 escrow states, 5 agreement snapshots
- 3 delivery tracking records, 3 delivery confirmations
- 1 open dispute (damaged headphones)
- 9 notifications (5 for buyer, 4 for seller)
- 37 transaction status history entries
- 3 user sessions (but no devices)

## What's Missing

The following gaps prevent a rich experience across the buyer screens:

### 1. Devices — 0 rows
The Login Sessions feature in Security Settings joins `user_sessions` with `devices`. No device data means empty session list. Need devices for the buyer and real user.

### 2. More Buyer Notifications — only 5
The notification page has filters (payments, delivery, disputes, system alerts, verification) but only 5 notifications exist for the buyer with no system_alert or verification types. Need ~8-10 more covering all notification types.

### 3. Dispute Response — 0 rows
The dispute detail page shows a seller response section, but no response exists for the open dispute. Add one seller response to make the detail page richer.

### 4. Second Dispute (resolved)
Only 1 dispute exists. Adding a resolved dispute for the completed transaction (TX-005) gives the disputes list a richer view with both open and resolved states.

### 5. Escrow State for TX-001
Transaction 001 (awaiting_payment) has no escrow state. Add one with `awaiting_payment` state.

## Data to Insert

### Devices (3 rows)
- Buyer's Chrome on Windows device
- Buyer's Safari on iPhone device  
- Real user's Chrome device

### Link devices to existing sessions
Update the 3 existing user_sessions to reference their device_id.

### Additional Notifications for Buyer (8 rows)
Cover all UI filter types:
- 2x `verification_update` — verify email reminder, identity verification reminder
- 2x `security_alert` — new login detected, password changed
- 1x `system_message` — welcome message
- 1x `delivery_update` — delivery dispatched for TX-002
- 1x `transaction_update` — TX-001 created
- 1x `dispute_update` — dispute response from seller

Mix of read/unread, spread across last 10 days.

### Dispute Response (1 row)
Seller's response to the open dispute on TX-004.

### Second Dispute — resolved (1 row + 2 status history + 1 outcome)
A resolved dispute on TX-005 (completed transaction) — reason: `wrong_item_received`, resolved as `release_to_seller` since buyer eventually confirmed satisfaction.

### Escrow State for TX-001 (1 row)
State: `awaiting_payment`, all amounts 0.

## Execution

All inserts will be done via the data insert tool (not migrations, since this is data seeding). The inserts will be executed in dependency order:
1. Devices
2. Update user_sessions with device_ids  
3. Notifications
4. Dispute + dispute status history + dispute outcome
5. Dispute response for existing dispute
6. Escrow state for TX-001

## Files Modified

None — this is purely database data insertion.

