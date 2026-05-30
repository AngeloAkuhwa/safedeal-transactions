## What's wrong

Two issues confirmed from the screenshots:

1. **Layout squash (tabmode.png):** The desktop table renders from `lg` (1024px). At tablet width — content well ~810px after the admin sidebar — the 8 columns (Priority / Dispute / Parties / Amount / Status / SLA / Agent / Actions) get crushed: `#DI...` truncates to two chars, headers overlap (`AMOUNTSTATUS`), buyer names show as `T...`/`C`, status badges wrap onto 3 lines.
2. **Fetch flakiness (tabmode2.png):** "Unable to load dispute queue. Try again." appears on a viewport where the same data loads fine on a hard refresh. The current `authedFetch` hard-redirects to `/auth` if `getSession()` momentarily returns null during hydration, and `getAdminDisputesQueue` surfaces any non-2xx (including transient 401/5xx) as a terminal error with no retry.

## Fix (UI + service layer, two files)

### 1. `src/pages/AdminDisputes.tsx` — raise the table breakpoint and render cards as a 2-up grid in the tweener zone

- Change `<div className="hidden lg:block w-full">` (desktop table wrapper) → `<div className="hidden xl:block w-full">`. The 8-column table only appears at ≥1280px viewport, where there's actually room for it.
- Change `<div className="space-y-3 p-3 lg:hidden">` (cards wrapper) → `<div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 xl:hidden">`. Cards now cover every viewport below xl, and at md/lg they sit two-up so the queue doesn't look empty in tablet/medium-desktop mode.
- No changes to card internals — the existing card already shows Priority, Dispute #, item, parties, amount, reason, status, SLA, agent, and the Review + kebab actions in a compact, non-squashed form.

### 2. `src/services/admin-disputes.service.ts` — make initial load resilient

- In `authedFetch`: if `getSession()` returns no session, attempt `refreshSession()` once before redirecting to `/auth`. Keep the existing `typeof window` guard. This removes the hydration-race redirect.
- In `getAdminDisputesQueue`: on `401`, call `supabase.auth.refreshSession()` and retry the fetch once before redirecting. On `>= 500` or network error, retry once with a 600ms backoff before surfacing the error.
- Response shape, params, and exports stay identical.

## Out of scope

- KPI strip, filter row, pagination — untouched.
- Admin sidebar / `AdminLayout` — untouched.
- No backend or schema changes.

## Verification

- **Tablet (~768–1023px):** Cards render in a 2-column grid; no truncated `#DI...`, no overlapping headers, status badges fit on one line.
- **Medium desktop (~1024–1279px, the user's 1096px preview):** Cards in a 2-column grid; previously squashed table is hidden in this zone.
- **Desktop (≥1280px):** Original 8-column table returns unchanged.
- **Hard refresh on `/admin/disputes`:** No flash redirect to `/auth`; if the first call 401s once, it silently refreshes and retries; the "Unable to load" state only appears on a real, repeated failure.