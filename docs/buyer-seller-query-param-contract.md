# Buyer & Seller query-param / anchor contract

Companion to `admin-query-param-contract.md`. Every param below has both an emitter
and a consumer; anything not listed must not be emitted.

## Buyer

| Target route | Param / hash | Values | Consumer |
| --- | --- | --- | --- |
| `/auth` | `mode` | `login`, `signup` | `Auth.tsx` |
| `/auth` | `role` | `buyer`, `seller` | `Auth.tsx` |
| `/auth` | `redirect` | relative path starting with `/` | `Auth.tsx` |
| `/role-selection` | `redirect` | relative path starting with `/` (URL wins, `sessionStorage` fallback) | `RoleSelection.tsx` |
| `/marketplace`, `/dashboard/marketplace` | `category` | category slug | `BuyerMarketplace.tsx` |
| `/marketplace`, `/dashboard/marketplace` | `search` | free text | `BuyerMarketplace.tsx` |
| `/store/:seller/:product/checkout` | `qty` | integer >= 1, clamped to stock | `StorefrontCheckout.tsx` |
| `/dashboard/cart/checkout` | `session` | checkout session id | `CartCheckoutReview.tsx` |
| `/dashboard/transactions/:id/verify` | `action` | `dispute` (auto-opens dispute form) | `BuyerTransactionVerify.tsx` |
| `/dashboard/profile` | `#location` | hash anchor, scrolls to location block | `BuyerProfileSettings.tsx` |

## Seller

| Target route | Param / hash | Values | Consumer |
| --- | --- | --- | --- |
| `/seller/transactions` | `filter` | `awaiting-seller-confirmation`, `awaiting-delivery`, `disputed`, `completed`, `draft` | `SellerTransactions.tsx` |
| `/seller/transactions` | `date` | `all`, `today`, `this-week`, `this-month`, `this-quarter` | `SellerTransactions.tsx` |
| `/seller/transactions` | `search` | free text | `SellerTransactions.tsx` |
| `/seller/transactions/:id` | `#messages` | scrolls to / opens the message thread | `SellerTransactionDetail.tsx` |
| `/seller/transactions/:id` | `#rider` | scrolls to rider link card | `SellerTransactionDetail.tsx` |
| `/seller/payouts` | `status` | `completed`, `processing`, `pending`, `failed` | `SellerPayouts.tsx` |
| `/seller/disputes` | `filter` | `seller_response_pending`, `open`, `under_review`, `resolved` | `SellerDisputes.tsx` |
| `/seller/disputes/:id` | `section` | `overview`, `agreement`, `delivery`, `resolution` | `SellerDisputeDetail.tsx` |
| `/seller/storefront` | `filter` | `low_stock`, `out_of_stock` | `SellerStorefront.tsx` |
| `/seller/profile` | `section` | `payout`, `identity` | `SellerProfileSettings.tsx` |

## Rules

1. Backend-emitted deep links (`supabase/functions/seller-dashboard`) must use exactly the
   vocabularies above — the page is the source of truth, the edge function is aligned to it.
2. Never interpolate a possibly-undefined id into a path; hide or disable the control instead
   (see `SellerPayouts.tsx` transaction links).
3. Redirect params are only honoured when they are relative paths starting with `/`.
