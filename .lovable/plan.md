# Media Standards + Commerce Flag Correction

## PART A — Discovery findings

### A1. The commerce flags (what actually exists)

Three keys exist in `system_settings` (platform scope), confirmed by query:

| key | current value |
| --- | --- |
| `commerce.checkout_enabled` | `true` |
| `commerce.add_to_cart_enabled` | `false` |
| `commerce.disabled_reason` | the "not yet available" string |

So there are already **two** flags, matching the owner's mental model — the query that found only one key was reading a filtered subset. Both are registered in both catalogs: `src/lib/settings-catalog.ts:129-141` and `supabase/functions/_shared/settings-catalog.ts:30-31`. Neither is an orphan key, and the admin UI toggles at `src/pages/AdminSettings.tsx:775-788` write real keys (`AdminSettings.tsx:402-404`) and read them back (`:333-335`).

Where `commerce.add_to_cart_enabled` is read:
- Server resolver: `supabase/functions/_shared/commerce-gate.ts:31-33, 69-71`, exposed via `checkAddToCartAllowed` (`:120-129`).
- Server enforcement: `supabase/functions/buyer-cart/index.ts:182-183` — the cart **add** action rejects with 403 `add_to_cart_disabled`.
- Public read endpoint: `supabase/functions/commerce-config/index.ts`.
- Client: `src/hooks/useCommerceGate.ts:33`, consumed by `MarketplaceProductCard.tsx:56-57` and `PublicProductDetail.tsx:82-83`.

Where `commerce.checkout_enabled` is read/enforced server-side: `cart-checkout/index.ts:118`, `storefront-checkout/index.ts:164`, `claim-offer/index.ts:318`, `initiate-paystack-payment/index.ts:171-172`. Client mirrors at `BuyerCart.tsx:110-111`, `CartCheckoutReview.tsx:110-111`, `StorefrontCheckout.tsx:100-101`.

True enforcement state:

| flag | client | server | verdict |
| --- | --- | --- | --- |
| `commerce.add_to_cart_enabled` | yes (product card + detail) | yes (`buyer-cart` add only) | enforced both sides for `add` |
| `commerce.checkout_enabled` | yes (3 pages) | yes (4 functions incl. payment init) | enforced both sides |

**The real defects (not missing keys):**
1. `buyer-cart` gates only the `add` action. `update_quantity` is not gated (the gate appears once, in the add branch), so a buyer with an existing cart row can raise quantity by direct API call while add-to-cart is off.
2. Cart surfaces stay fully live while `add_to_cart_enabled` is false: the cart icon/count in `BuyerNav` and `BuyerCart.tsx` gate on `checkoutEnabled` only (`BuyerCart.tsx:111`), which is currently `true`. That is why cart "looks live" — the flag works; the cart UI just isn't reading it. This is the mismatch the owner observed.
3. Default divergence: `commerce-gate.ts:17-19` defaults `checkout_enabled:false`, while `useCommerceGate.ts:14-21` defaults `addToCartEnabled:true`. When the config fetch fails, client and server disagree.
4. Vendor-scope reads work, but `BuyerCart.tsx:110` resolves platform scope only, so a per-vendor cart disable is invisible in the cart.

### A2. Seller media upload flow

Entry point: `src/pages/SellerProductCreate.tsx` — hidden file inputs at `:352` and `:396` with `accept="image/*,video/*" multiple`, handler `handleFileUpload` at `:116-182`.

Client validation that exists today:
- Count only: max 3 images, max 1 video (`SellerProductCreate.tsx:121-139`).
- Magic-byte sniffing on jpeg/png/webp/mp4 in `src/services/create-transaction.service.ts:100-129`.
- `checkImageResolution(file, 400, 400)` exists in `create-transaction.service.ts:131-145` but **is never called** by the product flow.
- No file-size check, no aspect-ratio check, no dimension check, no format allow-list before upload.

Upload pipeline: `uploadProductFile` (`create-transaction.service.ts:147-228`) → `upload-evidence` `sign_upload` → **signed** direct-to-Cloudinary upload, signature covering only `folder` + `timestamp` (`upload-evidence/index.ts:100-122`), no upload preset, no incoming transformation, no `allowed_formats` in the signature → **the signature does not constrain what is uploaded**. Then `register_file` writes the `files` row.

Server validation in `upload-evidence` `register_file` (`:145-215`):
- format allow-list jpg/jpeg/png/webp/mp4/mov/webm/pdf
- resource_type vs format cross-check
- size: 50 MB video / 10 MB other — **but from the client-supplied `bytes` field**, never re-read from Cloudinary
- rate limit 50 uploads/hr (`:75-90`)
- no width/height at all; `public.files` has no width/height columns (only `metadata_json jsonb`)

`seller-products` create (`supabase/functions/seller-products/index.ts:196-210`) links `file_ids` into `product_media` with **no media validation and no minimum image count** — a product can publish with zero images.

Other pipelines: avatar via `upload-avatar` (separate, signed, own rules); dispute/delivery evidence shares `upload-evidence` with a different `context_type`. There is no storefront banner/logo upload.

**What a seller can upload today that they should not:** a 200×150 px 9 MB JPEG; a 30-second 49 MB phone video at 480p; any aspect ratio; a product published with zero or one image; and — because size is self-reported and the Cloudinary signature is unconstrained — a client that lies about `bytes` bypasses the size limit entirely.

## PART B — Temu-grade media standards (proposal)

### Config keys (registered in BOTH catalogs, platform-writable)

| key | default | notes |
| --- | --- | --- |
| `media.image_min_dimension_px` | 800 | absolute floor, both sides |
| `media.image_recommended_min_px` | 1600 | advisory only (longest side) |
| `media.image_allowed_ratios` | `["1:1","3:4","4:5"]` | tolerance ±3% |
| `media.image_max_bytes` | 3145728 (3 MB) | |
| `media.image_allowed_formats` | `["jpeg","png","webp"]` | |
| `media.product_min_images_to_publish` | 3 | publish gate only |
| `media.product_max_images` | 10 | |
| `media.product_max_videos` | 1 | |
| `media.video_allowed_formats` | `["mp4","webm"]` | H.264 / VP9 |
| `media.video_min_height_px` | 720 | 1080 recommended |
| `media.video_max_seconds` | 60 | long enough for a product demo, short enough to keep storage and buyer attention sane |
| `media.video_max_bytes` | 52428800 (50 MB) | ~60 s of 1080p H.264; unchanged from today so no regression |
| `media.video_allowed_ratios` | `["1:1","4:5","9:16","16:9"]` | |
| `media.quality_advisories_enabled` | true | turns heuristic warnings on/off |
| `media.grandfather_before` | ISO timestamp set at migration time | products created before this are exempt from the publish gate |

HEIC: **reject client-side with a specific message** ("iPhone HEIC photos aren't supported — set Camera > Formats to Most Compatible, or re-save as JPEG"). Server-side transcoding via Cloudinary is possible but adds a paid transformation on every upload and an async failure mode; rejecting with clear guidance is cheaper and honest. Revisit if rejection rates are high.

### Enforcement design

HARD BLOCK (both sides): dimensions, aspect ratio, byte size, format, image/video counts, video duration and resolution.
- Client: a shared `src/lib/media-rules.ts` (mirrored to `supabase/functions/_shared/media-rules.ts`) reading resolved config and validating a `File` before upload — `createImageBitmap` for images, a hidden `<video>` `loadedmetadata` for duration/resolution. Errors are specific: "This image is 640×480. Minimum is 800×800." Never a generic failure.
- Server (authoritative): `upload-evidence.register_file` stops trusting the client. It calls the Cloudinary Admin API `resources/{type}/upload/{public_id}` to read real `bytes`, `width`, `height`, `format`, `duration`, then validates against the same config. On failure it deletes the Cloudinary asset, writes no `files` row, and returns 400 with the specific reason. Real dimensions/duration are persisted into `files.metadata_json`.
- `seller-products` publish path additionally enforces min/max image count and that every linked `file_id` belongs to the caller and passed validation.

ADVISORY WARNINGS (never block): white/neutral background, frame-fill percentage, burned-in text/watermark. Computed client-side with cheap heuristics (corner-pixel sampling for background; bounding box of non-background pixels for fill). Surfaced as an amber "Improve this photo" chip on the thumbnail plus a checklist in the existing media card — existing Alert/Badge components, no redesign. Rationale: a Lagos seller shooting on a phone in daylight will trip a background heuristic constantly; blocking them costs a listing, while one imperfect image costs almost nothing. Cloudinary's AI analysis add-ons could later justify blocking, but only after measuring false-positive rates on real listings.

### Grandfathering
Yes — existing published products are exempt. The publish gate applies only to products created or re-published after `media.grandfather_before`. Nothing is retroactively unpublished and no media is deleted. Instead, `SellerProductDetail` and the seller storefront card show a dismissible "Boost this listing" prompt when media falls below the new standard, linking to the edit flow with the failing checks listed.

### Seller UX (reusing existing components)
- Requirements panel rendered **above** the file picker in `SellerProductCreate` (and the edit path), generated from the resolved config so the numbers can never drift from enforcement.
- Per-file error text under each thumbnail in the existing `FileEntry` card, replacing the current generic toast.
- Publish button disabled with a reason chip when below `media.product_min_images_to_publish`; saving as draft is always allowed.

## PART C — Flag correction (proposal)

1. Keep the two existing keys — they are correct and already registered. Sharpen the admin copy so each says exactly what it gates:
   - Checkout enabled → "Allows payment and transaction creation. OFF blocks all checkout and payment initiation."
   - Add-to-cart enabled → "Allows adding items to a cart and changing cart quantities. OFF hides cart controls; existing carts are preserved."
2. Close the server gap: gate `update_quantity` (and any other quantity-increasing branch) in `buyer-cart` behind `checkAddToCartAllowed`. Removal from cart stays allowed when the flag is off.
3. Client mirror: `BuyerCart.tsx` and the `BuyerNav` cart control read `addToCartEnabled` as well as `checkoutEnabled`, resolving vendor scope where a single vendor is in play.
4. Align defaults: `useCommerceGate` DEFAULTS must equal `DEFAULT_COMMERCE_CONFIG` (fail closed on both flags when the config fetch fails).
5. **Existing cart contents: preserve, never delete.** With the flag off, cart rows stay in the database; the cart page renders read-only with the `disabled_reason` banner, quantity controls disabled, remove still available, checkout blocked. No cleanup job, no data loss.
6. No third flag is needed. "Hide add-to-cart but keep buy-now" is already expressible as `add_to_cart_enabled=false` + `checkout_enabled=true` — exactly today's state — and will behave correctly once steps 2 and 3 land.

## Technical details

- **Migrations**: one migration inserting the `media.*` keys at platform scope with defaults, plus `media.grandfather_before` set to `now()`. No table changes; width/height/duration go into `files.metadata_json`. Settings writes stay audited through the existing `system_settings_history` path.
- **Catalog registration**: every new key added to `src/lib/settings-catalog.ts` and `supabase/functions/_shared/settings-catalog.ts` with matching specs so `clampSetting` validates admin writes. Gated by the same permission as the rest of Platform Settings.
- **Admin UI**: a new "Media standards" card in the existing `AdminSettings` platform section, built from existing `ToggleRow` / number-input patterns. No redesign.
- **Edge functions to redeploy**: `upload-evidence`, `seller-products`, `buyer-cart`, plus a new `media-config` public read endpoint mirroring `commerce-config` / `pricing-config`.
- **Cloudinary**: keep signed uploads; add `allowed_formats` and `max_file_size` to the signed params so Cloudinary rejects oversized/wrong-format uploads at the edge, in addition to post-upload Admin API verification.

## Tests
- Unit: `media-rules` — dimension, ratio tolerance, size, format, count, duration, with boundary cases (799×800 fails, 800×800 passes).
- Contract: client and server media rule mirrors behave identically across a shared fixture set.
- **Server bypass test**: call `upload-evidence.register_file` directly with understated `bytes` against an undersized real asset — assert 400 and no `files` row, proving the client cannot skip validation.
- **Flag bypass test**: with `add_to_cart_enabled=false`, direct POST to `buyer-cart` `add` and `update_quantity` both return 403.
- Grandfathering: a pre-cutoff product with 1 image stays published and still renders.
- Admin smoke stays 47/47; full suite green.

## Risks and rollback
- The Cloudinary Admin API call adds ~200-400 ms per registration and a new dependency; on API error we fail closed and log — rollback is flipping a `media.server_verification_enabled` kill switch back to today's client-reported values.
- Stricter rules could frustrate sellers mid-listing; mitigated by requirements-before-picker, specific errors, and draft-saving always allowed.
- All thresholds are config rows, so any limit can be relaxed instantly from Platform Settings without a deploy.
- Flag changes are small and reversible; no data is deleted at any point in this plan.