## Goal

Restyle the Payout Details side drawer (`PayoutDetailDrawer.tsx`) to match the HTML reference (`Payout Management.html`, lines 697–807) exactly — colors, fonts, sizes, spacing, icons, backgrounds. Keep all current data, sections, handlers, and dialogs intact. Hide all scrollbars (no horizontal, no visible vertical) while preserving scroll behavior.

## Reference tokens (copy verbatim from HTML)

- Panel: `bg-slate-900 border-l border-slate-800 shadow-2xl`, width `w-[480px]` (keep `w-full sm:max-w-[480px]`).
- Sticky header: `p-6 border-b border-slate-800 bg-slate-900`, title `text-white text-lg font-semibold`, close button `w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white` with `fa-xmark` (use lucide `X`, same size).
- Body wrapper: `p-6 space-y-6`.
- Group cards: `bg-slate-800 rounded-lg p-4 space-y-2` (Pricing, Payout Account, Transaction Details / Linked, Payout History).
- Hero amount card: `bg-slate-800 rounded-xl p-4` with amount centered, `text-white text-4xl font-bold`, currency caption `text-slate-400 text-sm`. Status pill: `inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-semibold` (color varies by status — green/amber/red equivalents using same opacity pattern).
- Section headings: `text-white font-semibold text-sm`, wrapped in `space-y-3` (or `space-y-4` for Seller Information).
- Row label: `text-slate-400 text-sm`. Row value: `text-white text-sm` (status-colored variants keep their tone, e.g. `text-red-400`, `text-emerald-400`).
- Action buttons: `px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 text-sm font-medium` stacked `flex flex-col gap-2`. Release stays emerald, but uses same shape.

## Changes — `src/components/admin/payouts/PayoutDetailDrawer.tsx`

1. **Sheet container**
   - Class: `w-full sm:max-w-[480px] p-0 bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto overflow-x-hidden no-scrollbar`.
   - Keep scroll behavior, no visible scrollbar (matches HTML `::-webkit-scrollbar { display: none }`).

2. **Sticky header**
   - `p-6 border-b border-slate-800 bg-slate-900 sticky top-0 z-10 flex items-center justify-between`.
   - Left: `<h3 className="text-white text-lg font-semibold">Payout Details</h3>` with the payout id underneath as `text-xs text-slate-500 font-mono mt-0.5` (preserves current id display).
   - Close: square button `w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-300 hover:text-white` containing `<X className="h-4 w-4" />`.

3. **Body** — `p-6 space-y-6` (replaces current `p-4 space-y-5` + `<Separator/>` dividers; remove every `<Separator />` in the body).

4. **Hero amount card** (`bg-slate-800 rounded-xl p-4`)
   - Top row: `Payout ID` label (left, `text-slate-400 text-sm`) + code value (right, `text-white font-semibold text-sm font-mono`).
   - Center: `Amount` caption, `text-white text-4xl font-bold` amount, `text-slate-400 text-sm` currency/seller line. Show seller name + transaction code under amount in slate-400.
   - Status pill at bottom centered. Color map:
     - released/paid → `bg-emerald-500/20 border-emerald-500/30 text-emerald-400`
     - processing/initiated → `bg-blue-500/20 border-blue-500/30 text-blue-400`
     - awaiting_release/queued → `bg-amber-500/20 border-amber-500/30 text-amber-400`
     - failed → `bg-red-500/20 border-red-500/30 text-red-400`
     - blocked → `bg-orange-500/20 border-orange-500/30 text-orange-400`
   - Icon inside pill matches status (`Check`, `Loader2`, `Clock`, `X`, `ShieldOff`).
   - If `failure_reason` / `payout_blocked_reason` exists, show below pill as `text-xs text-red-400` centered.

5. **Eligibility checklist** — keep existing component, but wrap heading in `<h4 className="text-white font-semibold text-sm mb-3">Eligibility checklist</h4>` and section uses `space-y-3`. No card around it (mirrors HTML which has no card on freeform lists).

6. **Pricing breakdown** — `<h4>` heading + `bg-slate-800 rounded-lg p-4 space-y-2` card. Update `Row` to use `text-slate-400 text-sm` / `text-white text-sm`. Totals row: value gets `font-semibold text-white`; Seller Payout value `text-emerald-400 font-semibold`. Divider before totals: `border-t border-slate-700 my-2`.

7. **Seller payout account** — heading + `bg-slate-800 rounded-lg p-4 space-y-2` card. Rows: Bank, Account, Account name, Verification, Recipient code (verified → `text-emerald-400`, missing → `text-red-400`).

8. **Linked records** — heading + `flex flex-col gap-2`. Buttons use the action-button class: `px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-between text-sm font-medium` with `ExternalLink` icon on right.

9. **Timeline** — heading + `bg-slate-800 rounded-lg p-4`. List `max-h-72 overflow-y-auto pr-1 no-scrollbar space-y-3`. Each item: `border-l-2 border-slate-700 pl-3`, event_type `text-white text-sm font-medium`, timestamp `text-slate-400 text-xs`.

10. **Actions** — heading + `flex flex-col gap-2`.
    - Release: `px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium` (disabled state: `opacity-50 cursor-not-allowed`).
    - Retry: action-button class with `RotateCcw` icon (matches `fa-rotate-right`), label "Retry Payout".
    - Block/Unblock: action-button class with `ShieldOff`/`ShieldCheck` icon.
    - Open Transaction: action-button class with `ExternalLink` icon.
    - Disabled-release hint: `text-xs text-slate-500 mt-1`.

11. **Skeletons** — keep, but swap bg to `bg-slate-800/60` to match.

## CSS — `src/index.css`

`.no-scrollbar` already exists. Add a horizontal-block safeguard there:

```css
.no-scrollbar { overflow-x: hidden; }
```

(Only the SheetContent gets `no-scrollbar`; existing usages already opted in.)

## Out of scope

- No service / handler / routing logic changes.
- `PayoutEligibilityChecklist`, `PayoutStatusPill`, dialogs (`Confirm Release`, `Block/Unblock reason`) untouched.
- No changes to other payout components or tabs.
