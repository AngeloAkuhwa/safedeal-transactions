## Reading Mode (auto-scroll) for Admin shell + Escrow icon fix

### 1. New hook: `src/hooks/useAutoScroll.ts`
A reusable, framework-agnostic auto-scroll engine using `requestAnimationFrame`.

State exposed:
- `isActive`, `isPaused`
- `direction: "down" | "up"`
- `speed: "very-slow" | "slow" | "normal"` (px/sec: 10 / 20 / 32; default `very-slow`)
- methods: `start()`, `pause()`, `resume()`, `stop()`, `setDirection()`, `setSpeed()`
- `atTop`, `atBottom` helpers

Behavior:
- Optional `containerRef` param; defaults to `window` (`document.scrollingElement`).
- Uses delta time (`(now - last) / 1000 * pxPerSec`) → consistent on any refresh rate.
- Accumulator pattern so sub-pixel deltas at 10px/s still advance smoothly.
- Auto-stops on reaching top/bottom (within 1px tolerance) and toasts "You're at the bottom/top."
- Respects `prefers-reduced-motion`: `start()` is a no-op + returns reason `"reduced-motion"`.
- Pause triggers wired inside the hook:
  - `wheel`, `touchmove`, `keydown` (PageUp/Down/Arrow/Space/Home/End) → pause.
  - `visibilitychange` (tab hidden) → pause.
  - Listens for `focusin` on `input, textarea, select, [role="combobox"], [contenteditable]` → pause.
  - Observes `body` for `[data-state="open"]` on Radix dialogs/sheets/dropdowns/tooltips via MutationObserver → pause while any open.
- Cleans up RAF + listeners on unmount / stop.

### 2. New component: `src/components/admin/AdminReadingModeControl.tsx`
Two render variants via prop `variant: "desktop" | "mobile"`.

Desktop (lives in `AdminHeader` actions, left of Filters):
- Compact pill group matching existing slate-800/700 button style.
- Inactive: single button `BookOpen` icon + "Reading Mode" with Tooltip "Auto-scroll this page slowly".
- Active: expands inline to show
  - Play/Pause toggle (`Pause` ↔ `Play`)
  - Direction toggle (`ArrowDown` / `ArrowUp`)
  - Speed `Select` (Very Slow / Slow)
  - Stop (`Square`)
  - Subtle emerald dot + "Reading Mode active" label.

Mobile:
- When inactive: small icon button in `AdminMobileHeader` (next to Export).
- When active: a fixed bottom-center floating mini toolbar (`fixed bottom-4 left-1/2 -translate-x-1/2 z-50`) with Play/Pause, Direction, Stop. Rounded pill, slate-900/95 backdrop, subtle border.

All buttons get aria-labels per spec. Last speed/direction persisted to `localStorage` key `admin.readingMode`.

### 3. Wire into admin shell
- `AdminLayout.tsx`: instantiate the hook once at the layout level and pass state + actions to a small `ReadingModeContext` so both desktop header and mobile header/floater share one engine.
- Stop on route change via `useLocation` effect.
- Container ref = `window` (admin pages scroll the window, confirmed from `AdminLayout`).

### 4. Header integrations
- `AdminHeader.tsx`: render `<AdminReadingModeControl variant="desktop" />` immediately before the Filters button.
- `AdminMobileHeader.tsx`: add icon button in the right-side actions (before Export) + render the floating mobile bar from the layout when active.

### 5. Escrow Balance icon fix (`KpiCards.tsx`)
The current icon is `PiggyBank`, which reads as savings/consumer, not custodial escrow. Replace with `Landmark` (vault/institution feel) keeping the emerald color treatment. Tooltip copy unchanged.

### Acceptance check
- Click Reading Mode → page glides downward at ~10px/s.
- Manual wheel/touch/keyboard input pauses it; user must click Resume.
- Opening any Sheet / Dialog / Dropdown auto-pauses (Radix `data-state="open"`).
- Reaching bottom stops + toasts "You're at the bottom."
- `prefers-reduced-motion: reduce` disables auto-start with explanatory toast.
- Works identically on `/admin/dashboard` today and any future page wrapped in `AdminLayout`.
- Escrow KPI now uses `Landmark` icon.

### Files
- create `src/hooks/useAutoScroll.ts`
- create `src/components/admin/AdminReadingModeControl.tsx`
- create `src/components/admin/ReadingModeContext.tsx` (small provider)
- edit `src/components/admin/AdminLayout.tsx`
- edit `src/components/admin/AdminHeader.tsx`
- edit `src/components/admin/AdminMobileHeader.tsx`
- edit `src/components/admin/dashboard/KpiCards.tsx` (icon swap)
