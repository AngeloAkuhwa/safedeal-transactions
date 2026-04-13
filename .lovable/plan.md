

# Fix: Remove Hardcoded Values & Type Mismatches in Seller Storefront

## Problems

1. **`SellerDashboardResponse` type is stale** — the edge function now returns `verification_level`, `store_slug`, and `created_at` on the `seller` object, but the TypeScript interface only declares `full_name` and `avatar_url`. This forces unsafe `as any` casts everywhere.

2. **Hardcoded `verificationLevel` on Edit page** — `SellerProductDetail.tsx` line 153 has `const verificationLevel = "unverified"` instead of reading from dashboard data.

3. **Delivery method value mismatch** — the Create page stores `"courier_shipping"` in the DB, but the Edit page and Preview page reference `"shipping"` for the same option. Products created via the Create flow won't display correctly on Edit/Preview.

## Changes

### `src/services/seller-dashboard.service.ts`
Update the `SellerDashboardResponse.seller` interface to include the fields the edge function actually returns:
```typescript
seller: {
  full_name: string;
  avatar_url: string | null;
  store_slug: string | null;
  created_at: string | null;
  verification_level: string;
};
```

### `src/pages/SellerProductDetail.tsx`
- **Line 153**: Replace `const verificationLevel = "unverified"` with `const verificationLevel = dashData?.seller?.verification_level || "unverified"` (no more `as any` needed after the type fix above).
- **Line 406**: Change delivery value `"shipping"` to `"courier_shipping"` to match the Create page and DB values.

### `src/pages/SellerProductPreview.tsx`
- **Line 57**: Add `courier_shipping: "Courier / Shipping"` to the `formatDeliveryLabel` map. Keep `shipping` as a backward-compatible alias.
- **Line 92**: Remove the `as any` cast — it will work cleanly after the type update.

## No backend or DB changes needed
The edge function already returns all these fields. This is purely a frontend type + value consistency fix.

