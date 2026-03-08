

# Fix: Back to Home Navigation on Auth Page

## Problem
1. The "Back to home" link on mobile (`lg:hidden`) works but is only visible on mobile — desktop users have no back link.
2. The SafeDeal logo in the left `AuthInfoPanel` is not clickable.
3. The mobile SafeDeal logo in the right panel is also not clickable.

## Changes

### 1. `src/components/auth/AuthInfoPanel.tsx`
- Wrap the SafeDeal logo (`Shield` icon + "SafeDeal" text) in a `<Link to="/">` so clicking it navigates home on desktop.

### 2. `src/pages/Auth.tsx`
- Make the mobile SafeDeal logo (line ~57-60) a `<Link to="/">` as well.
- Move the "Back to home" link outside the `lg:hidden` wrapper so it's visible on all screen sizes, OR keep it mobile-only since desktop users can click the logo in the left panel.

Both changes are ~2 lines each. No backend changes needed.

