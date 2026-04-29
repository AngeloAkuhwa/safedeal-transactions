## Goal

Tighten the lower half of the landing page (7 sections) for density and consistency. No copy changes, no design redirection. All required SafeDeal-specific content was verified intact in this audit — no content restoration needed.

## Content audit (verified, no changes required)

- **Featured deals** (`demo-data.ts`): iPhone 15 Pro Max 256GB / ₦1,850,000 / TechHub Lagos / 4.9 ✓ · MacBook Pro 16-inch M3 / ₦3,200,000 / Premium Tech NG / 4.8 ✓ · Nike Air Max 90 / ₦185,000 / SneakerHub / 4.7 ✓
- **Verified sellers**: Chioma Electronics, TechHub Lagos, GameZone Nigeria, StylePlug Lagos — each shows rating, completed count, products count, Lagos, and verified badge ✓
- **Powerful features**: all 9 SafeDeal cards present (Protected Marketplace, Direct Deal Links, Funds Held Securely, Verified Seller Storefronts, Locked Agreement, Delivery Tracking, Buyer Confirmation, Evidence Uploads, Dispute Resolution) ✓
- **SafeDeal messaging** (escrow / verified sellers / direct links / Lagos-first / evidence disputes) — present across Hero, WhySafer, Protection, Transparency, FAQ, Footer ✓

## Shared targets (applied per section)

- Card padding: `p-4 sm:p-5` (≈16–20 px). Larger composite cards: `p-5 sm:p-6`.
- Icon boxes: `h-10 w-10` (40 px) for grid cards; `h-11 w-11` (44 px) max for emphasis tiles. Inner icon `h-5 w-5` or `h-[18px] w-[18px]`.
- Headings inside cards: `text-base sm:text-lg`, with `mb-1` not `mb-1.5`.
- Body inside cards: `text-[13px] leading-relaxed text-muted-foreground`.
- Section header block: `mb-5 sm:mb-7` (was `mb-6 sm:mb-10`).
- Grid gaps: `gap-3 sm:gap-4`.

## Per-section edits

### 1. `TransparencyTrustSection.tsx` — Built on transparency and trust

- Header `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- `PillarCard`: padding `p-5` → `p-4 sm:p-5`, icon box `h-11 w-11 rounded-2xl` → `h-10 w-10 rounded-xl`, `mb-4` → `mb-3`, title `mb-1.5` → `mb-1`, body `text-sm` → `text-[13px] leading-relaxed`.
- Pillars grid: `mb-6 gap-4 lg:gap-5` → `mb-5 gap-3 sm:gap-4`.
- "SafeDeal Lagos Launch" stats card: `p-5 sm:p-6` → `p-4 sm:p-5`; inner header `mb-4 sm:mb-5` → `mb-3 sm:mb-4`, title `text-base sm:text-lg` (keep) `mb-1` (keep), subtitle `text-sm` → `text-[13px]`. Stat tiles `p-3` → `p-2.5`, value `text-lg sm:text-xl` → `text-base sm:text-lg`.

### 2. `PowerfulFeaturesSection.tsx` — Powerful features for secure transactions (9 cards)

- Header `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- `FeatureCard`: padding `p-5` → `p-4 sm:p-5`, icon box `h-11 w-11 rounded-2xl` → `h-10 w-10 rounded-xl`, `mb-4` → `mb-3`, title `mb-1.5` → `mb-1`, body `text-sm` → `text-[13px] leading-relaxed`.
- Grid: `gap-4 lg:gap-5` → `gap-3 sm:gap-4`.
- All 9 features remain unchanged (verified above).

### 3. `TrustSafetySection.tsx` — Trust & Safety

- Header `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- `TrustCard`: padding `p-5` → `p-4 sm:p-5`, icon box `h-11 w-11 rounded-2xl` → `h-10 w-10 rounded-xl`, `mb-4` → `mb-3`, title `mb-1.5` → `mb-1`, body `mb-3.5 text-sm` → `mb-3 text-[13px] leading-relaxed`, footer pill `pt-3` → `pt-2.5`.
- Grid `gap-4 lg:gap-5` → `gap-3 sm:gap-4`.

### 4. `NeedHelpSection.tsx` — Need help?

- Header `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- `HelpCard`: same compact treatment as TrustCard (`p-4 sm:p-5`, icon `h-10 w-10 rounded-xl mb-3`, title `mb-1`, body `mb-3 text-[13px] leading-relaxed`, footer `pt-2.5`).
- Grid `gap-4 lg:gap-5` → `gap-3 sm:gap-4`.

### 5. `FAQSection.tsx` — Frequently Asked Questions

- Already uses Accordion ✓ — keep structure.
- Header `mb-6 sm:mb-10` → `mb-5 sm:mb-7`.
- `FaqItem` wrapper padding `p-1.5` → `p-1`.
- Trigger: `px-3.5 py-2.5 sm:px-4` → `px-3 py-2 sm:px-3.5`, font `text-sm sm:text-[15px]` → `text-[13px] sm:text-sm`.
- Trigger icon tile `h-7 w-7` → `h-6 w-6`, icon `h-4 w-4` → `h-3.5 w-3.5`.
- Content: `px-3.5 pb-3 pl-[52px] text-sm sm:px-4 sm:pb-3.5 sm:pl-[58px]` → `px-3 pb-2.5 pl-[44px] text-[13px] sm:px-3.5 sm:pb-3 sm:pl-[48px]`.
- Grid `gap-3 lg:gap-4` → `gap-2.5 lg:gap-3`.

### 6. `CTASection.tsx` — Final CTA

- Section padding `py-12 sm:py-14` → `py-10 sm:py-12`.
- Eyebrow chip: keep, `mb-4` → `mb-3`.
- Heading `mb-3` → `mb-2`.
- Subhead `mb-6` → `mb-5`.
- Button group `mb-8` → `mb-6`. Buttons: padding `px-5 py-3` → `px-4 py-2.5`, font `text-sm sm:text-[15px]` → `text-[13px] sm:text-sm`, icon `h-4 w-4` (keep). Keep all 3 CTAs unchanged (Browse Marketplace · Start Selling · Create Protected Transaction).
- Trust stat row tiles: `px-3.5 py-3` → `px-3 py-2.5`, label `text-xs sm:text-sm` → `text-[11px] sm:text-xs`.
- Decorative blur sizes `h-72 w-72` → `h-56 w-56` (less heavy on shorter section).

### 7. `Footer.tsx`

- Footer wrapper: `pb-6 pt-10 sm:pt-12` → `pb-5 pt-8 sm:pt-10`.
- Top grid wrapper `mb-10 gap-8` → `mb-8 gap-6`.
- Brand: logo tile `h-10 w-10` → `h-9 w-9` icon `h-5 w-5` → `h-[18px] w-[18px]`; brand text `text-xl` → `text-lg`; tagline `mb-5 text-sm` → `mb-4 text-[13px]`; location row `mb-5` → `mb-4`.
- Social icon tiles `h-10 w-10` → `h-9 w-9`, icon `h-4 w-4` (keep).
- Column headings `mb-4 text-sm` → `mb-3 text-[13px]`.
- Link lists `space-y-2.5 text-sm` → `space-y-2 text-[13px]`.
- Bottom bar `pt-6` → `pt-5`, copyright/legal `text-xs` (keep).

## Files to edit

- `src/components/landing/TransparencyTrustSection.tsx`
- `src/components/landing/PowerfulFeaturesSection.tsx`
- `src/components/landing/TrustSafetySection.tsx`
- `src/components/landing/NeedHelpSection.tsx`
- `src/components/landing/FAQSection.tsx`
- `src/components/landing/CTASection.tsx`
- `src/components/landing/Footer.tsx`

No changes to: copy, demo data, color tokens, structure, button counts, accordion logic, or `index.css`.

## Verification after implementation

- View `/` at the user's 1246×890 viewport.
- Confirm each lower section's vertical footprint shrinks ~20–30% with consistent card sizing across the 4 grid sections (Transparency / Features / Trust / Help).
- Confirm FAQ rows are noticeably more compact while still using the accordion.
- Confirm CTA still shows all 3 buttons and footer remains 4 columns at lg.
