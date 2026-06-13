# Fix plan: make the Escrow tab open the real page

## What I’ll change
1. Update the admin navigation gate so `/admin/escrow` is treated as a built route instead of a roadmap placeholder.
2. Verify the Escrow sidebar item navigates to the live page rather than triggering the "Coming soon" toast.
3. Sanity-check the same gating pattern for any other newly added admin pages so this mismatch does not immediately recur.

## Root cause
The router already includes `/admin/escrow` in `src/App.tsx`, and the page component exists.
But the admin sidebar uses a separate allowlist in `src/components/admin/useAdminNav.ts`, and that allowlist still excludes `/admin/escrow`.
Because of that mismatch, clicking the tab shows the roadmap toast instead of navigating.

## Technical details
- Update `BUILT_ROUTES` in `src/components/admin/useAdminNav.ts`
- Keep routing in `src/App.tsx` unchanged
- Validate click behavior from `/admin/dashboard` to `/admin/escrow`

## Expected result
Clicking **Escrow** in the admin sidebar will open the actual Escrow page instead of showing "Coming soon."