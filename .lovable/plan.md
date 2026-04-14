

# Buyer Marketplace Enhancements

## Summary

Fix broken product images (Cloudinary URL space issue), add "Sort by" label and "Price Filter" button to the filter bar, update the escrow banner text, and make the heart/wishlist button toggle with visual feedback.

## Changes

### 1. Fix broken images — two parts

**a) `supabase/functions/upload-evidence/index.ts` (line 214)**
Add `.trim()` to prevent future bad URLs:
```typescript
const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
```

**b) SQL migration** to fix existing broken URLs in the `files` table:
```sql
UPDATE public.files
SET file_url = REPLACE(file_url, 'cloudinary.com/ ', 'cloudinary.com/')
WHERE file_url LIKE '%cloudinary.com/ %';

UPDATE public.files
SET secure_url = REPLACE(secure_url, 'cloudinary.com/ ', 'cloudinary.com/')
WHERE secure_url IS NOT NULL AND secure_url LIKE '%cloudinary.com/ %';
```

### 2. Update filter bar — `src/pages/BuyerMarketplace.tsx`

- Change search placeholder to `"Search for electronics, fashion, vehicles..."`
- Change the escrow banner text from "Escrow Protected" to `"All purchases protected by SafeDeal escrow"` (matching reference)
- Add a "Price Filter" button (cosmetic/placeholder for now) next to the sort dropdown
- Update sort dropdown to show "Sort by: Newest" style label

### 3. Wishlist toggle — `src/components/marketplace/MarketplaceProductCard.tsx`

- Add `liked` state toggle on the heart button click
- When liked: fill the heart red (`fill-current text-destructive`), when not liked: outline only
- This is client-side only for now (no persistence)

### 4. Update trust footer text

Change the trust footer description to match the reference: "Funds are held in escrow until you confirm delivery and satisfaction."

## No new database tables needed

