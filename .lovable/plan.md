

# Preserve Quantity Through Auth Redirect + E2E Test

## Summary

Store the selected quantity in `sessionStorage` alongside the redirect URL so it survives the auth flow. On return, restore it. Then test the full flow in the browser.

## Changes

### 1. Update `src/components/storefront/PurchaseAuthModal.tsx`

- Accept a new prop `quantity: number`
- In `navigateToAuth`, also store `sessionStorage.setItem("safedeal_quantity", String(quantity))`

### 2. Update `src/pages/PublicProductDetail.tsx`

- On mount, check for `sessionStorage.getItem("safedeal_quantity")`. If present, parse it and call `setQuantity(parsedValue)`, then remove the key
- Pass `quantity` prop to `<PurchaseAuthModal>`

### 3. Browser E2E test

After implementing, navigate to a public product page as an anonymous user, select quantity > 1, click "Buy with SafeDeal Protection", verify the modal appears with correct product info, click through to auth, and confirm redirect returns to the product page with quantity preserved.

## No database or edge function changes needed.

