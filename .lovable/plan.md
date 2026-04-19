

# Fix: Private offer media never linked → buyer sees no images/videos

## Root cause (verified end-to-end against the DB)

The seller uploaded 1 image + 1 video for "Touch Light Phone" through the Create Transaction wizard. After payment, the buyer sees no media because **the file rows were never linked to either `transaction_media` (draft) or `product_media` (published product)**. The files exist orphaned in the `files` table.

There are **3 cooperating bugs** in the publish flow, all in `supabase/functions/create-transaction/index.ts`:

### Bug A — `handleSaveDraft` accepts `file_ids` but never inserts into `transaction_media`
Lines 184–186 only flip `is_temporary=false` on the file rows. There is no `INSERT INTO transaction_media (transaction_id, file_id, media_type, sort_order)`. So the draft has zero linked media.

### Bug B — `handlePublish` queries a column that doesn't exist
Line 279 selects `display_order` from `transaction_media`, but the actual column is `sort_order`. The Supabase JS query errors out, `mediaFilesRes.data` becomes `null`, then `mediaFiles = []` (line 291). The downstream `product_media` insert (line 391) is silently skipped.

### Bug C — Same wrong column used in two more places
- `verify-paystack-payment/index.ts` lines 226, 228 → snapshot JSON for the agreement also fails to read media.
- `resolve-share-token/index.ts` lines 85 → the share-token review page can't read media either.
Both reference `display_order` instead of `sort_order`.

### Net effect
`product_media` for product `48048ef2…` has 0 rows. So `transaction-agreement` and `transaction-detail` (which we recently fixed to read from `product_media`) correctly return empty arrays — there is genuinely nothing to show. The seller's uploads were lost from the user-visible flow.

## Fix plan

### 1. `supabase/functions/create-transaction/index.ts` (primary fix)

**`handleSaveDraft` — actually link uploaded files to the draft.**
After the `Promise.all` block, replace the existing `transaction_media` rows for this draft with the latest `file_ids`:
- `DELETE FROM transaction_media WHERE transaction_id = :draft AND file_id NOT IN (:file_ids)`
- For each `file_id`, infer `media_type` from `files.mime_type` (`image/*` → `image`, `video/*` → `video`)
- `UPSERT INTO transaction_media (transaction_id, file_id, media_type, sort_order)` ordered by the array position. Use `onConflict: "transaction_id,file_id"` (need a unique index — see step 4).

**`handlePublish` — fix the read.**
Line 279: `display_order` → `sort_order` (also update the `.order(...)` call).

**`handlePublish` — make the `product_media` insert robust.**
Already correct (lines 381–393), but add an `if (error) console.error` after the insert so future failures surface in logs instead of being swallowed.

### 2. `supabase/functions/verify-paystack-payment/index.ts`
Lines 226 & 228: replace `display_order` with `sort_order` in the SELECT and the `.order(...)`. This ensures the immutable agreement snapshot built at payment time also captures the media URLs.

### 3. `supabase/functions/resolve-share-token/index.ts`
Lines 85 & next-line `.order(...)`: same `display_order` → `sort_order` rename so the public review page (used for buyer-specific offers and marketplace shares) renders media correctly.

### 4. One-off SQL data repair (migration)
Backfill the orphaned files for this stuck transaction and any similar cases:

```sql
-- Step 1: For the specific stuck product, link the latest image+video the seller uploaded
INSERT INTO product_media (product_id, file_id, media_type, sort_order, is_primary)
VALUES
  ('48048ef2-38d5-4ffe-887b-3acea32bca92',
   '932b7a35-fea9-4bb9-8b5f-b350743db615', 'image', 0, true),
  ('48048ef2-38d5-4ffe-887b-3acea32bca92',
   '0e2d64a3-e0be-4447-ace7-10f5d08a4010', 'video', 1, false);

-- Step 2: Update the offer item's primary_media_url for thumbnail rendering
UPDATE buyer_specific_offer_items
SET primary_media_url = (SELECT file_url FROM files WHERE id = '932b7a35-fea9-4bb9-8b5f-b350743db615')
WHERE offer_id = 'e16a3324-692c-4496-bcf8-bed5be74dcf2';

-- Step 3: Add unique index for future onConflict upserts
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transaction_media_txn_file
  ON transaction_media (transaction_id, file_id);
```

## Why this is the right fix (not a quick hack)

- Restores the documented data flow: `upload-evidence` → `files` → `transaction_media` (draft) → `product_media` (on publish).
- Fixes the bug for **all** future private offers, not just this user. Marketplace listings already work because `seller-products` correctly inserts into `product_media`.
- Backfills the one stuck record so this buyer sees their already-paid item without re-upload.
- The agreement snapshot and the public share page also start showing media.

## Files touched

- `supabase/functions/create-transaction/index.ts` — link media on draft save; rename `display_order` → `sort_order`; log media insert errors.
- `supabase/functions/verify-paystack-payment/index.ts` — rename `display_order` → `sort_order` (×2).
- `supabase/functions/resolve-share-token/index.ts` — rename `display_order` → `sort_order` (×2).
- New migration: backfill `product_media` for product `48048ef2…`, set `primary_media_url`, and add `uniq_transaction_media_txn_file` unique index.

## Out of scope

- Changing the wizard UI (the client already sends `file_ids` correctly).
- Migrating away from `transaction_media` entirely (still useful as a draft staging table; we just need the link to work).
- Any change to `transaction-agreement` or `transaction-detail` — they already read `product_media` correctly from our previous fix; they were just receiving an empty set.

