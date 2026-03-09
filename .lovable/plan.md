
# Fix Escrow Banner Logic + Responsive Typography/Dimensions

## Problem 1: Escrow Banner — Revert to State-Based Logic

The correct original condition was:
```
escrow && (escrow.state === "funds_held" || tx.money_status === "funds_held_in_escrow")
```

The change to `!["cancelled", "refunded"].includes(tx.status)` is wrong because:
- It shows the banner for `draft`, `awaiting_payment` states where no escrow exists yet
- `escrow` object may be non-null but in `pending` state before funds are actually held

**Correct logic** should be based on escrow.state values that represent "escrow is meaningfully active":
- `funds_held` → "Escrow Protection Active" (primary/blue banner)  
- `funds_released` → "Transaction Completed — Funds Released" (success/green banner)
- `funds_frozen` → "Funds Frozen — Dispute In Progress" (destructive/red banner)
- Hide for `funds_releasing`, `pending`, `refund_pending`, `refund_issued`

This matches the state machine (escrow and transaction status are independent, as documented).

## Problem 2: Font Sizes + Card Dimensions — Precise Screen Matching

### Current issues (from code analysis):
| Element | Current | Fix |
|---|---|---|
| Card section `h2` headings | `text-xl sm:text-2xl` | `text-base sm:text-lg` |
| Header `h1` | `text-2xl sm:text-3xl` | `text-xl sm:text-2xl lg:text-3xl` |
| Item title inside card | `text-xl sm:text-2xl` | `text-lg sm:text-xl` |
| Payment "Total Paid" label | `text-base sm:text-lg` | `text-sm sm:text-base` |
| Payment "Total Paid" amount | `text-xl sm:text-2xl` | `text-lg sm:text-xl` |
| Card padding | `p-4 sm:p-6 lg:p-8` | `p-4 sm:p-6` (remove lg:p-8) |
| NextActionCard heading | `text-xl font-bold` | `text-lg font-bold` |
| Icon sizes in headings | `h-5 sm:h-6` | `h-5` (consistent) |
| Body text in delivery/contact | `text-sm sm:text-base` | `text-sm` |
| Metadata text | `text-xs sm:text-sm` | `text-xs sm:text-sm` ✓ |
| Countdown number | `text-3xl` | `text-2xl sm:text-3xl` |

### Gaps/spacing:
- Section gap: `gap-6 sm:gap-8` → `gap-5 sm:gap-6`
- Space-y in left column: `space-y-6 sm:space-y-8` → `space-y-5 sm:space-y-6`
- Timeline card content padding: `p-3 sm:p-4` ✓ (keep)
- Item image: `h-64 sm:h-80` → `h-56 sm:h-64 lg:h-72` (less tall)

## Files to Edit

Single file: `src/pages/BuyerTransactionDetail.tsx`

### Specific changes:

**Escrow banner (lines 313–328):**
- Restore state-based condition: `escrow && ["funds_held", "funds_frozen", "funds_released"].includes(escrow.state)`
- Three variants: primary (held), destructive (frozen), success (released)
- Remove the `tx.status === "completed"` check, use `escrow.state` instead

**Header h1 (line 281):** `text-2xl sm:text-3xl` → `text-xl sm:text-2xl lg:text-3xl`

**Card headings h2 (lines 353, 397, 453, 468, 504, 519):** `text-xl sm:text-2xl` → `text-base sm:text-lg font-bold`

**Card padding (lines 277, 352, 396, 452, 467, 503, 518, 566, 616):** Remove `lg:p-8` where present, cap at `sm:p-6`

**Item title h3 (line 362):** `text-xl sm:text-2xl` → `text-lg sm:text-xl`

**Payment total (lines 639–640):** `text-base sm:text-lg` → `text-sm sm:text-base`; `text-xl sm:text-2xl` → `text-lg sm:text-xl`

**NextActionCard heading (line 147):** `text-xl` → `text-lg`

**Countdown (line 157):** `text-3xl` → `text-2xl sm:text-3xl`

**Section gaps (line 332):** `gap-6 sm:gap-8` → `gap-5 sm:gap-6`

**Left column spacing (line 335):** `space-y-6 sm:space-y-8` → `space-y-5 sm:space-y-6`

**Item image (line 358):** `h-64 sm:h-80` → `h-52 sm:h-64`

**Heading icon sizes (multiple lines):** `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5` consistently
