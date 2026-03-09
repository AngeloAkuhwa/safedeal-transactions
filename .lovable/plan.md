

# Plan: Contact Seller Modal, Receipt Print/Download & Order Tracking Page

## Overview

Add three features to the transaction details page:
1. **Send Message Modal** — opens when clicking "Send Message to Seller" with text + file upload capability
2. **Print/Download Receipt** — add receipt generation with print/download controls for item details
3. **Order Tracking Page** — new dedicated page based on the uploaded reference, linked from "Track Order" button

---

## 1. Contact Seller Modal

### New Component: `src/components/transactions/ContactSellerModal.tsx`

A dialog modal containing:
- **Textarea** for message body
- **File upload area** supporting images/documents (drag-drop + click-to-upload)
- **Submit button** to send the message
- State management for selected files, loading, success/error feedback
- Integration with an edge function (or mock for now) to send the message

The modal will receive `sellerId`, `transactionId`, and `sellerName` as props.

### Wiring
- Update `BuyerTransactionDetail.tsx` line ~528: wrap "Send Message to Seller" button to open the modal via `useState` controlled `<Dialog>`.

---

## 2. Print/Download Receipt

### New Component: `src/components/transactions/TransactionReceipt.tsx`

A printable receipt component containing:
- Transaction code, date created
- Item details (title, description, quantity, condition)
- Pricing breakdown (item amount, fees, total)
- Seller info
- Delivery address

### Controls
Add to the **header dropdown** ("More Actions"):
- "Download Receipt" → generates PDF or triggers `window.print()` on a hidden print-ready receipt
- "Print Receipt" → same flow but opens browser print dialog

### Implementation
- Add a hidden `<div>` with the receipt markup (or use a print-specific component)
- On click: use `window.print()` or a library like `react-to-print` (already common pattern, no new deps needed)

---

## 3. Order Tracking Page

### New Page: `src/pages/BuyerTransactionTracking.tsx`

Based on the uploaded `tracking-2.txt` reference, this page includes:
- **Trust banner** — escrow protection status
- **Transaction header** — item name, status badges
- **Horizontal progress timeline** — 8-step visual (Created → Completed)
- **Next Action Card** — what buyer needs to do / wait for
- **Delivery Tracking Card** — courier info, tracking number, "Track Package" external link
- **Delivery Evidence Grid** — seller-uploaded proof photos
- **Full Transaction Timeline** — vertical timeline with all events
- **Audit Log** — detailed event history
- **Right sidebar** — Agreement snapshot, Item details, Seller info, Help card

### Route
Add to `App.tsx`:
```
/dashboard/transactions/:transactionId/tracking
```

### Service
Extend `transaction-detail.service.ts` or create `tracking.service.ts` to fetch tracking-specific data (reuse existing endpoint or add to edge function).

### Wiring
- Update `BuyerTransactionDetail.tsx` header "Track Order" button (line ~289) to navigate to `/dashboard/transactions/${tx.id}/tracking`
- Add "Track Order" link in other relevant places (e.g., transaction table row actions, verification page)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/transactions/ContactSellerModal.tsx` | Modal for messaging seller |
| `src/components/transactions/TransactionReceipt.tsx` | Printable receipt component |
| `src/pages/BuyerTransactionTracking.tsx` | Dedicated order tracking page |

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add tracking route |
| `src/pages/BuyerTransactionDetail.tsx` | Wire modal open, receipt print, tracking link |

---

## Technical Notes

- **No new dependencies required** — uses existing Dialog, Button, Textarea, file input
- **File upload** — reuse existing Cloudinary integration pattern from `src/lib/cloudinary.ts`
- **Message sending** — create edge function `send-seller-message` or implement later; for now, show toast success
- **Receipt** — use CSS `@media print` for clean print output
- **Tracking page** — fully responsive design matching reference, using existing UI components

