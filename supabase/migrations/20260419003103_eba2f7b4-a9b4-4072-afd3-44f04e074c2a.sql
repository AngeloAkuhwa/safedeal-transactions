-- Add unique index for transaction_media upsert
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transaction_media_txn_file
  ON transaction_media (transaction_id, file_id);

-- Backfill product_media for the stuck product (idempotent via NOT EXISTS)
INSERT INTO product_media (product_id, file_id, media_type, sort_order, is_primary)
SELECT '48048ef2-38d5-4ffe-887b-3acea32bca92'::uuid, '932b7a35-fea9-4bb9-8b5f-b350743db615'::uuid, 'image', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM product_media
  WHERE product_id = '48048ef2-38d5-4ffe-887b-3acea32bca92'::uuid
    AND file_id = '932b7a35-fea9-4bb9-8b5f-b350743db615'::uuid
);

INSERT INTO product_media (product_id, file_id, media_type, sort_order, is_primary)
SELECT '48048ef2-38d5-4ffe-887b-3acea32bca92'::uuid, '0e2d64a3-e0be-4447-ace7-10f5d08a4010'::uuid, 'video', 1, false
WHERE NOT EXISTS (
  SELECT 1 FROM product_media
  WHERE product_id = '48048ef2-38d5-4ffe-887b-3acea32bca92'::uuid
    AND file_id = '0e2d64a3-e0be-4447-ace7-10f5d08a4010'::uuid
);

-- Update offer item primary_media_url for thumbnail rendering
UPDATE buyer_specific_offer_items
SET primary_media_url = (SELECT COALESCE(secure_url, file_url) FROM files WHERE id = '932b7a35-fea9-4bb9-8b5f-b350743db615'::uuid)
WHERE offer_id = 'e16a3324-692c-4496-bcf8-bed5be74dcf2'::uuid;