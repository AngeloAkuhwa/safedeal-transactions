

# Batch 4: Files, Cloudinary Metadata, Transaction Media, Agreement Snapshots, Delivery Proof

## Enums (6)

1. **file_provider** — cloudinary, manual
2. **file_resource_type** — image, video, raw, document
3. **file_context_type** — transaction_media, delivery_proof, dispute_evidence, response_evidence, system_attachment
4. **file_retention_category** — draft_upload, transaction_media, delivery_proof, dispute_evidence, response_evidence, system_attachment
5. **transaction_media_type** — image, video
6. **delivery_proof_type** — shipping_receipt, package_photo, signature_proof, shipment_video, other

## Table Creation Order

1. **files** — Central metadata registry. All columns per spec. Unique constraint on `(provider, provider_asset_id)`. Indexes on provider, provider_asset_id, context_type, retention_category, retain_until, deleted_from_provider. FK: uploaded_by_user_id -> profiles.id (ON DELETE SET NULL). Has `updated_at` trigger.

2. **transaction_media** — Links product images/videos to transactions. FK: transaction_id -> transactions.id (CASCADE), file_id -> files.id (CASCADE). Indexes on transaction_id, file_id, sort_order. No `updated_at` (append-only).

3. **transaction_agreement_snapshots** — Immutable locked agreement. Unique on transaction_id. FK: transaction_id -> transactions.id (CASCADE), locked_by_user_id -> profiles.id (SET NULL). Index on transaction_id. No `updated_at` (immutable).

4. **delivery_proof_files** — Seller proof uploads. FK: transaction_id -> transactions.id (CASCADE), file_id -> files.id (CASCADE), uploaded_by_user_id -> profiles.id (SET NULL). Indexes on transaction_id, file_id, proof_type. No `updated_at` (append-only).

## Key Design Decisions

- Only `files` has `updated_at` — the other three tables are append-only/immutable
- `transaction_agreement_snapshots` has no `updated_at` by design — once locked, it must never change
- `(provider, provider_asset_id)` unique constraint prevents duplicate Cloudinary asset records
- `legal_hold` boolean on files supports future evidence protection
- `retain_until` supports per-file retention scheduling
- RLS enabled on all 4 tables, policies deferred
- `ON DELETE SET NULL` for optional profile references, `ON DELETE CASCADE` for transaction/file references

## Implementation

One database migration creating 6 enums and 4 tables. A copy saved to `src/db/migrations/004_batch4_files_media.sql`. No UI or API code.

