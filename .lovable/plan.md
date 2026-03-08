

# Profile Settings — Visual Refinement Plan

## Problem
The current components use dimensions and font sizes that are appropriate but need refinement to match the HTML design while avoiding oversized elements. The HTML design uses compact, well-proportioned sizing.

## Changes

### 1. `src/components/profile/TrustSafetyPanel.tsx`
- Replace single-line items with **title + description** two-line format matching the HTML design
- Each item gets a `h-8 w-8 rounded-lg bg-primary/10` icon container (not too large)
- Title: `text-sm font-medium`, Description: `text-xs text-muted-foreground`
- Items: "Verified Information", "Secure Transactions", "Protected Evidence", "Transparent Timeline" with their descriptions from the HTML

### 2. `src/components/profile/PersonalInfoSection.tsx`
- Avatar: change to `rounded-2xl` (matching HTML's `rounded-2xl`)
- Avatar size stays `h-20 w-20` (appropriate)
- Inputs: add `rounded-xl` for rounder corners matching the design
- Verified check icons: reduce from `h-5 w-5` to `h-4 w-4`

### 3. `src/components/profile/SecuritySection.tsx`
- "Security Alerts" row: add a `Switch` toggle (matching the HTML design which shows a toggle, not just text)
- Icon containers: change from `rounded-lg` to `rounded-xl`
- Row padding: reduce from `p-4` to `p-3` for tighter spacing

### 4. `src/components/profile/AccountVerificationSection.tsx`
- Icon containers: `rounded-lg` → `rounded-xl`
- Row padding: `p-4` → `p-3`

### 5. `src/components/profile/NotificationPreferencesSection.tsx`
- Icon containers: `rounded-lg` → `rounded-xl`
- Row padding: `p-4` → `p-3`

### 6. `src/components/profile/DangerZoneSection.tsx`
- Row padding: `p-4` → `p-3`

### 7. `src/pages/BuyerProfileSettings.tsx`
- Hero section: reduce padding from `py-10` to `py-8`
- Hero icon container: reduce from `h-12 w-12` to `h-10 w-10`
- Hero icon: reduce from `h-6 w-6` to `h-5 w-5`
- Title: keep `text-2xl sm:text-3xl` (already appropriate)
- Save button: add `Save` icon before text
- Cancel button: use neutral background style (`bg-muted text-muted-foreground hover:bg-muted/80`)

### Files Modified (visual only, no backend changes)
1. `src/components/profile/TrustSafetyPanel.tsx`
2. `src/components/profile/PersonalInfoSection.tsx`
3. `src/components/profile/SecuritySection.tsx`
4. `src/components/profile/AccountVerificationSection.tsx`
5. `src/components/profile/NotificationPreferencesSection.tsx`
6. `src/components/profile/DangerZoneSection.tsx`
7. `src/pages/BuyerProfileSettings.tsx`

