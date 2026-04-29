## Goal

Tighten 4 mid-page sections so they feel premium and content-driven on desktop. No copy changes (one duplicate removal in Protection), no design direction changes — only padding, sizing, gaps, and one animation refinement.

## Shared spacing primitive

`src/index.css` `.section-y` is currently `clamp(2.5rem, 3.5vw, 5.5rem)` (max 88px). That's already in range, so keep it. Per-section overrides via `!py-*` only where a section still feels too tall (Protection). All other tightening happens via internal paddings and gaps.

---

## 1. `WhySaferSection.tsx` — "Why SafeDeal feels safer"

- Header block: `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- Card padding: `p-5` → `p-4 sm:p-5`.
- Icon box: `h-12 w-12 rounded-2xl` → `h-10 w-10 rounded-xl`; icon `h-6 w-6` → `h-5 w-5`; `mb-4` → `mb-3`.
- Title: keep `text-base sm:text-lg`, tighten `mb-1.5` → `mb-1`.
- Body: `text-sm` → `text-[13px] leading-relaxed`.
- Grid gap: `gap-4 lg:gap-5` → `gap-3 sm:gap-4`.

## 2. `MarketplaceVsDirectSection.tsx` — "Built for marketplace and direct deals"

- Header block: `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- FlowCard padding: `p-5` → `p-4 sm:p-5`.
- Header row `mb-4` → `mb-3`; icon box `h-10 w-10` → `h-9 w-9`, icon `h-5 w-5` → `h-[18px] w-[18px]`.
- Description `mb-4 text-sm` → `mb-3 text-[13px] leading-relaxed`.
- Bullets: `mb-6 space-y-2` → `mb-4 space-y-1.5`; bullet text `text-sm` → `text-[13px]`; check icon `h-4 w-4` → `h-3.5 w-3.5`.
- CTA button: add `h-9 text-sm` (compact, not full default `h-10`).
- Grid gaps `gap-4 sm:gap-5 lg:gap-5` → `gap-4`.

## 3. `HowItWorks.tsx` — "How SafeDeal Works"

- Header block: `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- TabsList: `mb-6` → `mb-5`, trigger `py-2.5 text-sm` → `py-2 text-[13px]`.
- FlowCard padding: `p-5` → `p-4 sm:p-5`.
- FlowCard header: `mb-4` → `mb-3`, icon box `h-10 w-10` → `h-9 w-9`.
- Step list `space-y-3` → `space-y-2.5`.
- Step number circle: `h-7 w-7` → `h-6 w-6 text-[11px]`.
- Step row gap `gap-2.5` → `gap-2.5` (keep), title `text-sm` (keep), desc `text-xs leading-snug`.
- Grid gaps `gap-4 sm:gap-5 lg:gap-5` → `gap-4`.
- Bottom explanation card: `mt-6 sm:mt-8 p-5` → `mt-5 sm:mt-6 p-4`; icon box `h-11 w-11` → `h-10 w-10`; title `text-sm sm:text-base` (keep); body `text-xs sm:text-sm` → `text-xs sm:text-[13px] leading-relaxed`.
- Animation: step rows currently render statically. Add a lightweight per-row reveal — wrap each `<li>` in a `useScrollReveal` ref with a staggered `transition-delay` based on index (e.g. `style={{ transitionDelay: ${i * 60}ms }}`). The existing reveal hook already starts in the visible state with `opacity-0 translate-y-2 → opacity-100 translate-y-0` and only animates after intersection — so no blank space is reserved during load (the list keeps its final height).

## 4. `ProtectionSection.tsx` — "Your money stays protected…"

- Section padding override: add `!py-10 sm:!py-12 lg:!py-14` on the `<section>` (currently up to ~88px from `.section-y`).
- Header block: `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- Heading: keep `.h-section` (already clamp-scaled).
- Two-column grid: `gap-6 lg:gap-10` → `gap-5 lg:gap-8`.
- Left column step list `space-y-5` → `space-y-3.5`.
- StepRow:
  - icon box `h-10 w-10 rounded-2xl` → `h-9 w-9 rounded-xl`, icon `h-5 w-5` → `h-[18px] w-[18px]`.
  - title `text-base sm:text-lg mb-0.5` → `text-[15px] sm:text-base mb-0.5 font-semibold`.
  - desc `text-sm` → `text-[13px] leading-snug`.
- Warning box (duplicate fix):
  - Current already shows ONE bold heading + one body line. Confirmed by reading file: only one `"Do not pay outside SafeDeal"` heading + `"Outside payments are not protected by escrow."` body. **No actual duplicate exists in code today** — leave copy as-is. (Note this in the user-facing summary so they know we verified.)
  - Tighten box: `p-4` → `p-3.5`, body `text-xs` → `text-[12px]`.
- Right card (`ProtectedTransactionCard`):
  - Wrapper: `rounded-3xl p-5 shadow-xl` → `rounded-2xl p-4 shadow-lg`; add `lg:max-w-[420px] lg:ml-auto` to narrow the card on desktop.
  - Header block: `mb-4 pb-4` → `mb-3 pb-3`.
  - Status list spacing: `space-y-2.5` → `space-y-1.5`, wrapper `mb-4` → `mb-3`.
  - EscrowRow: `p-3 gap-3 rounded-xl border-2` → `p-2.5 gap-2.5 rounded-lg border`; title `text-sm` → `text-[13px]`; subtitle `text-xs` → `text-[11px]`; icon `h-5 w-5` → `h-[18px] w-[18px]`.
  - Escrow total tile: `p-4` → `p-3`; amount `text-xl sm:text-2xl` → `text-lg sm:text-xl`; caption `text-xs` (keep).
- Animation: status rows already use a single reveal on the card. Improve to a staggered highlight by:
  - Giving each `EscrowRow` an `index` prop and applying `style={{ transitionDelay: ${index * 90}ms }}` along with `useScrollReveal`.
  - Order matches: Payment Secured → Funds Held → Delivery In Progress → Buyer Verification Pending → Funds Released. The list's final height is reserved by the natural flow, so no blank space appears during stagger.

---

## Files to edit

- `src/components/landing/WhySaferSection.tsx`
- `src/components/landing/MarketplaceVsDirectSection.tsx`
- `src/components/landing/HowItWorks.tsx`
- `src/components/landing/ProtectionSection.tsx`

No changes to `src/index.css`, copy, color tokens, or component structure beyond what's listed.

## Verification (after implementation)

- View `/` at the user's current 1246×890 viewport via the preview.
- Confirm each section's vertical footprint shrinks ~20–30% and grids/cards remain aligned across sm / md / lg breakpoints.
- Confirm animation stagger reveals smoothly without reserving extra space on initial paint.
