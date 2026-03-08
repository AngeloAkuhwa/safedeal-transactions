

# Fix: "Seller Notified" Timeline Step Always Greyed Out

## Problem
The "Seller Notified" (`seller_response_pending`) step is greyed out because it only gets colored when there's a matching entry in `dispute_status_history`. In practice, the dispute may go directly from `open` to `under_review` without an explicit `seller_response_pending` status transition being recorded. The seller IS notified when the dispute opens, so this step should reflect that.

## Solution
Change the timeline component to treat "Seller Notified" as an implicit step that is always reached once the dispute is opened. Instead of relying solely on `dispute_status_history` entries, synthesize the "Seller Notified" entry from the dispute open timestamp if it's not already in the timeline.

### `src/components/disputes/DisputeTimeline.tsx`
- After receiving the timeline data, check if `seller_response_pending` is missing from entries but `open` exists
- If so, synthesize a "Seller Notified" entry with the same timestamp as the `open` entry (or slightly after)
- This ensures the step always appears colored once a dispute is opened
- Keep the existing future-steps logic so `under_review` and `resolved` still show as pending when not yet reached

```text
Before:
  ● Dispute Opened (colored)
  ○ Seller Notified (greyed — no history entry)
  ○ Review in Progress (greyed)
  ○ Resolution Issued (greyed)

After:
  ● Dispute Opened (colored)
  ● Seller Notified (colored — auto-synthesized)
  ○ Review in Progress (greyed)
  ○ Resolution Issued (greyed)
```

| File | Change |
|------|--------|
| `src/components/disputes/DisputeTimeline.tsx` | Synthesize "Seller Notified" entry when dispute is open but no `seller_response_pending` history exists |

