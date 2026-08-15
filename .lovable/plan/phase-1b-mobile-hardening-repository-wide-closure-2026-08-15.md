# Phase 1b Mobile Hardening — Repository-Wide Closure

## Scope
- Add mobile card/list alternatives for every data table that can overflow, including buyer recent purchases and buyer disputes; document any intentionally desktop-only table.
- Replace hover-only/sub-44px evidence and photo actions with persistent, accessible 44px controls.
- Fix the touch-target class across filters, tooltips, breadcrumbs, checkboxes, quick actions, notifications, and mobile row actions; add an inverted repository scanner with a narrow, documented allowlist.
- Remove duplicate sticky-header collisions, stabilize stacked banners/icons, and move mobile sidebar spacing responsibility into shared layout/sidebar behavior.
- Replace page-shell `h-screen`/`min-h-screen` patterns with dynamic viewport-safe layouts where applicable and replace layout-blanking loaders on the named buyer/storefront/payment pages with skeletons.
- Debounce storefront search and preserve prior query data while filters change.
- Validate at 360px and 390px where authentication permits, and otherwise render/test affected components directly.

## Technical approach
- Reuse existing Button, Skeleton, card, table, sidebar, and responsive patterns; keep service/data behavior unchanged.
- Use `md:hidden` cards paired with `hidden md:block` tables, ensuring equivalent actions and status information.
- Create a contract test that scans interactive JSX for explicit dimensions/padding resolving below 44px and fails closed unless a file/pattern has an individual documented exemption.
- Run three evidence commands: focused Phase 1b tests, the full relevant test suite, and TypeScript checking; include verbatim summaries plus screenshots/measurements and limitations.
