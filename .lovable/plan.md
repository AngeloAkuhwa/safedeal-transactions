

# Updated Plan: Batch 1 + Batch 2 (Revised with Scope Clarifications)

This updates `.lovable/plan.md` to include a retroactive Batch 1 scope clarification section and the existing Batch 2 plan. No code changes — plan document update only.

---

## New `.lovable/plan.md` Content

```markdown
# Batch 1: Seller Storefront + Product Catalog (Scope Clarifications)

## What Batch 1 Covers

- Seller-owned products (CRUD, media, categories)
- Product categories
- Product media (images + video)
- Seller storefront management dashboard (premium dark theme)
- Public seller storefront (`/store/:sellerSlug`)
- **Public Product Detail page** (`/store/:sellerSlug/:productSlug`) — named deliverable
- No purchase-to-transaction logic

## Clarification 1: Public Product Detail Is a Named Batch 1 Deliverable

The Public Product Detail page at `/store/:sellerSlug/:productSlug` is a first-class Batch 1 screen, not implied. It is shared by:
- Seller public storefront flow (visitor clicks product from `/store/:sellerSlug`)
- Later buyer marketplace / public discovery flow (Batch 2+)
- Any direct product link shared externally

One screen, one data shape, one route — reused everywhere.

## Clarification 2: Public Storefront Screens Are Reusable Public Commerce Surfaces

The routes `/store/:sellerSlug` and `/store/:sellerSlug/:productSlug` are **public commerce surfaces**, not seller dashboard extensions. They are:
- Accessible without authentication
- Auth-aware (show different header for logged-in buyers vs anonymous visitors)
- Reused by buyer marketplace and purchase flows in later batches
- The canonical way to view any product on SafeDeal

## Clarification 3: Empty Storefront State

Batch 1 includes a dedicated seller empty storefront state:
- Shown when the seller has zero products
- Contains onboarding messaging explaining what the storefront does
- Prominent "Add Product" CTA
- Explanation that published products appear on their public store URL

## Clarification 4: Product Status Definitions

| Status | Public Visibility | Purchasable (later) |
|--------|-------------------|---------------------|
| `draft` | Not visible publicly | No |
| `published` | Visible if `visibility_type = 'public'` | Yes (when purchase flow exists) |
| `out_of_stock` | Still visible publicly if public | No — shown but marked unavailable |
| `archived` | Removed from active storefront | No |

## Clarification 5: Buyer-Specific Products in Batch 1

- Buyer-specific visibility exists in the schema in Batch 1
- Buyer-linking and private-offer flows are **deferred to a later batch**
- In Batch 1, buyer-specific products remain non-public, seller-managed listings only
- They appear in the seller's storefront management dashboard but are never surfaced publicly

---

# Batch 2: Public Marketplace Aggregation + Discovery (Revised)

[Existing Batch 2 content remains unchanged — architecture diagram, auth vs data visibility, product inclusion rules, all 8 changes, exclusions, and 10 success criteria as currently written in the plan]
```

## What This Plan Update Does

1. **Adds Batch 1 retroactive clarifications** — 5 explicit scope items that align the plan with the current UI direction
2. **Keeps Batch 2 exactly as approved** — no changes to marketplace architecture, edge function, or success criteria
3. **No code changes** — this is a plan document update only

