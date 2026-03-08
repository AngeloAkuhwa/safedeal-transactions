

# Fix: Evidence Preview, Agreement Rendering, Timeline Flow, and Nav Username

## Issues

1. **Evidence images not previewing** -- Broken image thumbnails show hash text instead of actual image. The `getCloudinaryThumbnail` function may produce broken URLs. Need `onError` fallback on `<img>` tags and a download button for each evidence item.

2. **Agreement snapshot renders as raw JSON** -- `AgreementSnapshotSection` dumps `JSON.stringify()` in a `<pre>` block. Should render structured fields (item, buyer, seller, amount, delivery method, etc.) in a clean grid.

3. **Username shows "User" on non-dashboard pages** -- `BuyerDisputes`, `BuyerNotifications`, `BuyerDisputeDetail` all read `queryClient.getQueryData(["buyer-dashboard"])` which is empty if the user navigated directly. Need a shared hook that fetches profile as fallback.

4. **Timeline flow incorrect** -- The `DisputeTimeline` shows future steps based on a fixed ordered list `["open", "seller_response_pending", "under_review", "resolved"]`. Not all disputes go through every step (e.g., a dispute can go from `open` directly to `under_review` to `resolved`). The component should only show future steps that haven't been reached AND come after the current status in the flow, not all missing steps.

## Changes

### 1. New file: `src/hooks/useBuyerIdentity.ts`
- Try reading from `["buyer-dashboard"]` query cache
- If not available, run a lightweight query using `getBuyerProfile()` with `queryKey: ["buyer-identity"]`
- Return `{ buyerName, avatarUrl, isLoading }`

### 2. Update pages to use `useBuyerIdentity`
**Files**: `src/pages/BuyerDisputes.tsx`, `src/pages/BuyerNotifications.tsx`, `src/pages/BuyerDisputeDetail.tsx`
- Replace `queryClient.getQueryData<BuyerDashboardResponse>(["buyer-dashboard"])` pattern with `useBuyerIdentity()`

### 3. Fix evidence preview in `src/components/disputes/BuyerClaimSection.tsx`
- In `EvidenceThumbnail`: add `onError` handler on `<img>` to swap to icon fallback when thumbnail URL fails
- Add a download button (Download icon) overlaid on each thumbnail
- In `EvidenceViewer` dialog: add a download button in the header

### 4. Add download button to `src/components/disputes/DeliveryProofSection.tsx`
- Add download icon overlay on each proof file thumbnail

### 5. Rewrite `src/components/disputes/AgreementSnapshotSection.tsx`
- Parse `snapshot_json` and render known fields in a labeled grid:
  - Item title, description, condition
  - Buyer name, seller name
  - Amount + currency
  - Delivery method, inspection period
- Any remaining unknown keys rendered in a collapsed "Raw Details" section

### 6. Fix `src/components/disputes/DisputeTimeline.tsx`
- Instead of showing ALL missing statuses as future, determine future steps based on `currentStatus` position in the flow
- Only show steps that come AFTER the current status and haven't been reached
- E.g., if current is `open` and timeline has `[open]`, show `seller_response_pending`, `under_review`, `resolved` as pending
- If current is `under_review` and timeline has `[open, under_review]`, only show `resolved` as pending (skip `seller_response_pending` since it was bypassed)

| File | Change |
|------|--------|
| `src/hooks/useBuyerIdentity.ts` | New hook |
| `src/pages/BuyerDisputes.tsx` | Use `useBuyerIdentity` |
| `src/pages/BuyerNotifications.tsx` | Use `useBuyerIdentity` |
| `src/pages/BuyerDisputeDetail.tsx` | Use `useBuyerIdentity` |
| `src/components/disputes/BuyerClaimSection.tsx` | Image error fallback + download buttons |
| `src/components/disputes/DeliveryProofSection.tsx` | Download buttons |
| `src/components/disputes/AgreementSnapshotSection.tsx` | Structured rendering |
| `src/components/disputes/DisputeTimeline.tsx` | Fix future step logic |

