# Reading Mode: Fix boundary logic + persistent floating control

## Problem

1. Clicking "Reading Mode" at the top of the page incorrectly shows "You're at the top." This is because `start()` in `useAutoScroll.ts` checks `top <= 1` for direction `up` — but the live `direction` state isn't read from the ref before the check, and the at-top guard fires regardless of intent.
2. After scrolling down past the admin header, there's no way to control Reading Mode without scrolling back up — the only controls live in `AdminHeader` (desktop) or `AdminMobileHeader`.
3. The current mobile floater only appears when active. There's no persistent compact entry point that follows the page.

## Fix 1 — Boundary logic in `src/hooks/useAutoScroll.ts`

- Use a 3px threshold constant (`EDGE_THRESHOLD = 3`) for both the tick loop and the start guards.
- In `start()`:
  - Read direction from `directionRef.current` (already done) but ALSO sync it from the latest `direction` state by accepting an optional `directionOverride` param so the caller can start in a specific direction without a stale ref.
  - Only show "at top" when direction is `up` AND `top <= threshold`.
  - Only show "at bottom" when direction is `down` AND `top >= max - threshold`.
  - When at-bottom with direction `down`, suggest switching: emit `onBlocked("at-bottom-suggest-up")` (extend the union). The provider will toast "You're at the bottom. Switch direction to scroll up." and offer no auto-flip (user choice).
  - Same mirror for at-top with direction `up`.
- Allow direction change while running: when `setDirection` is called and `isActive`, do NOT stop — the existing `directionRef` is read each tick, so reversing already works. Verify by removing any implicit stop, and ensure the at-edge auto-stop only triggers for the matching direction.
- Default `initialDirection` stays `"down"`.

## Fix 2 — Shared state already in place

`ReadingModeProvider` wraps `AdminLayout` and exposes a single `useAutoScroll` instance via `useReadingMode()`. Header control + new floating control will both consume this same context — no duplicate loops.

## Fix 3 — New persistent floating control

Extend `src/components/admin/AdminReadingModeControl.tsx` with two new variants:

- `variant="desktop-floater"` — bottom-right of main content, visible only after the user scrolls past ~120px (track via a small `useEffect` listening to `window.scroll`). Hidden on `lg:` breakpoint when not yet scrolled. Two states:
  - **Inactive (collapsed pill):** `BookOpen` icon + "Reading Mode" label, click starts.
  - **Active (expanded):** Play/Pause, Direction toggle (Down/Up), Speed select (Very Slow / Slow), Stop. Same styling as existing desktop pill (slate-900/95 surface, slate-700 border, soft shadow, emerald active dot).
  - Position: `fixed bottom-5 right-5 z-40`, with `pb-[env(safe-area-inset-bottom)]` safety.
  - Smooth transition: `transition-opacity duration-200` + translate-y on appear.
- Mobile floater (existing `mobile-floater`) is upgraded to also show when **inactive but scrolled past 120px** as a small "Reading Mode" pill on the left edge of the bottom bar. When active it expands as today (Play/Pause, Direction, Stop, plus a small speed menu via Popover for Very Slow / Slow).

Mount points (in `src/components/admin/AdminLayout.tsx`):
- Add `<AdminReadingModeControl variant="desktop-floater" />` next to the existing `mobile-floater`.
- Both live inside `ReadingModeProvider` so they share state with the header.

Header control (`AdminHeader`) and mobile trigger (`AdminMobileHeader`) keep their current placement and wiring — no duplicate logic since all controls call into the same context.

## Fix 4 — Click-on-control should not pause

The control is rendered outside the document scroll flow and its buttons don't fire `wheel`/`touchmove` on `window`. The current pause listeners (`wheel`, `touchmove`, `keydown`, `focusin`) won't fire from button clicks. Confirm by adding `onPointerDown={(e) => e.stopPropagation()}` on the floater wrapper as a defensive measure.

## Acceptance criteria mapping

- Top + click Reading Mode → starts scrolling down (no false toast). ✓ via `start()` direction-aware guard.
- Boundary toasts only for the active direction. ✓
- Direction switchable mid-scroll, smoothly reverses. ✓ (refs already drive each tick).
- Floating control reachable mid-page on desktop and mobile. ✓
- Header + floating share state. ✓ (single context).
- Reduced-motion still blocks start with the existing toast. ✓
- No duplicate RAF loops. ✓ (single hook instance).

## Files

- Edit `src/hooks/useAutoScroll.ts` — threshold constant, fix `start()` direction guards, extend `onBlocked` reasons, accept optional `directionOverride` on `start`.
- Edit `src/components/admin/ReadingModeContext.tsx` — handle new `onBlocked` reasons with appropriate toasts.
- Edit `src/components/admin/AdminReadingModeControl.tsx` — add `desktop-floater` variant, upgrade `mobile-floater` to also render when inactive after scroll, add scroll-past-header visibility hook.
- Edit `src/components/admin/AdminLayout.tsx` — mount `desktop-floater`.

No DB or backend changes.
