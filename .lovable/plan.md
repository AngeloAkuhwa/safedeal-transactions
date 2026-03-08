

# Downsize Oversized Elements on Verification Page

The current components use oversized dimensions (large icons, huge timer text, heavy padding) that look bloated on regular screens. This pass scales everything down to more practical sizes.

## Changes by File

### `src/components/verification/VerificationCountdown.tsx`
- Icon container: `w-16 h-16` → `w-12 h-12`, icon `h-8 w-8` → `h-6 w-6`
- Title: `text-2xl` → `text-lg`
- Timer: `text-5xl` → `text-3xl`, container padding `p-6` → `p-4`, border `border-2` → `border`
- Outer padding: `p-8` → `p-6`
- Gap between timer labels: `gap-8` → `gap-6`

### `src/components/verification/VerificationChecklist.tsx`
- Section title: `text-2xl` → `text-lg`
- Check icon containers: `w-8 h-8` → `w-7 h-7`
- Item title: `text-base font-bold` → `text-sm font-semibold`
- Item padding: `p-5` → `p-4`
- Card padding: `p-6 lg:p-8` → `p-5 lg:p-6`
- Info banner padding: `p-5` → `p-4`

### `src/components/verification/VerificationActions.tsx`
- Section title: `text-2xl` → `text-lg`
- CTA button icons: `w-16 h-16` → `w-12 h-12`, inner icon `h-8 w-8` → `h-6 w-6`
- CTA button padding: `py-6` → `py-5`
- CTA label: `text-lg` → `text-base`
- Card padding: `p-6 lg:p-8` → `p-5 lg:p-6`
- Protection reminder padding: `p-5` → `p-4`

### `src/components/verification/WhatHappensCard.tsx`
- Title: `text-xl` → `text-lg`
- Icon containers: `w-10 h-10` → `w-8 h-8`, icons `h-5 w-5` → `h-4 w-4`
- Sub-titles: `text-base font-bold` → `text-sm font-semibold`
- Card padding: `p-6 lg:p-8` → `p-5 lg:p-6`

### `src/components/verification/AutoReleaseWarning.tsx`
- Icon container: `w-14 h-14` → `w-10 h-10`, icon `h-7 w-7` → `h-5 w-5`
- Title: `text-lg` → `text-base`
- Card padding: `p-6 lg:p-8` → `p-5 lg:p-6`

### `src/components/verification/VerificationSidebar.tsx`
- Card paddings: `p-6` → `p-5`
- Section titles: `text-lg` → `text-base` where oversized
- Avatar: `h-12 w-12` → `h-10 w-10`
- Need Help card: `h-6 w-6` icon → `h-5 w-5`, title `text-lg` → `text-base`

### `src/components/verification/ConfirmReceiptDialog.tsx`
- Success icon: `w-20 h-20` → `w-16 h-16`, inner `h-10 w-10` → `h-8 w-8`
- Title: `text-2xl` → `text-xl`
- Padding: `p-8` → `p-6`

### `src/pages/BuyerTransactionVerify.tsx`
- Page headline: `text-2xl lg:text-3xl` → `text-xl lg:text-2xl`
- Amount: `text-2xl` → `text-xl`
- Main content gap: `gap-8` → `gap-6`
- Section spacing: `py-8` → `py-6`

