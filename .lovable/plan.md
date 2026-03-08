

# Fix Mismatched Times: Countdown vs Text Labels

## Problem
The countdown timer correctly shows **remaining time** (~15 hours), but the trust banner and notification alert say "within **48** hours" — which is the **total** verification window, not the time remaining. This is confusing.

## Solution
The banner and notification alert should display the **remaining** hours/minutes dynamically instead of the total window. Compute remaining hours from the deadline and use that in the banner/alert text. Keep `windowHours` (total window) for the descriptive cards (WhatHappensCard, AutoReleaseWarning) where it makes sense to reference the full window.

## Changes

### `src/pages/BuyerTransactionVerify.tsx`
- Add a computed `remainingHours` value: `Math.max(0, Math.ceil((deadline - now) / 3_600_000))`
- Trust banner text: change `{windowHours} hours` → `{remainingHours} hours`
- Notification alert title: change `{windowHours} hours` → `{remainingHours} hours`
- Keep `windowHours` passed to `WhatHappensCard` and `AutoReleaseWarning` (those describe the total window policy, which is correct)

This way the countdown timer and the text labels will always show consistent remaining time.

