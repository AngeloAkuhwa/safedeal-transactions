
## Current State

- `BuyerTransactionDetail.tsx` (880 lines): fully implemented. Key wiring points:
  - Line 289: "Track Order" button — no `onClick`
  - Line 304: "Download Receipt" dropdown item — no `onClick`
  - Line 528: "Send Message to Seller" button — no `onClick`
  - Lines 672–674 and 760–762: two more "Download Receipt" buttons in payment summary cards
- `App.tsx`: no tracking route, no import for tracking page
- None of the three new files exist: `ContactSellerModal.tsx`, `TransactionReceipt.tsx`, `BuyerTransactionTracking.tsx`

## Implementation Plan

### Step 1 — Create `src/components/transactions/ContactSellerModal.tsx`

Dialog with:
- Header showing seller name
- Controlled textarea (min 10 chars, validated before submit)
- Drag-and-drop / click file upload zone: accepts `image/*,.pdf`, max 10MB per file, shows file chip list with ✕ remove buttons
- Send button with `isLoading` spinner → `toast.success("Message sent!")` on mock submit
- Props: `open`, `onOpenChange`, `sellerName`, `transactionId`

### Step 2 — Create `src/components/transactions/TransactionReceipt.tsx`

Screen-hidden, print-visible component:
- CSS class `hidden print:block` wrapping a `forwardRef` `<div>`
- Receipt layout: SafeDeal header, tx code + date, item details table, pricing breakdown, seller info, delivery address, footer
- `@media print` injection via `<style>` tag inside the component OR via Tailwind `print:` variants

### Step 3 — Create `src/pages/BuyerTransactionTracking.tsx`

New full page reusing `getTransactionDetail()`:
- BuyerNav + breadcrumb back to transaction detail
- Shield trust banner (escrow status)
- Transaction header: item title, status + money badges, tx code + date
- 8-step horizontal progress tracker: `Draft → Awaiting Payment → Payment Secured → Preparing → Dispatched → Delivered → Verification → Completed` — icon circles connected by lines, steps colored green/primary/muted by position vs current status
- Next Action card (same logic as detail page)
- Delivery Tracking card: courier, tracking number, shipped/expected dates, external "Track Package" link
- Delivery Evidence grid: image thumbnails from `delivery_proof_files`, click → simple overlay lightbox
- Vertical audit log: `status_history` entries with timestamps
- Right sidebar (desktop): Item summary, Seller card, Payment summary, Help card
- Full responsive: stacked on mobile, 2/3+1/3 grid on desktop

### Step 4 — Update `src/App.tsx`

Add inside the `requireRole="buyer"` block (after line 50):
```tsx
import BuyerTransactionTracking from "./pages/BuyerTransactionTracking";
// ...
<Route path="/dashboard/transactions/:transactionId/tracking" element={<BuyerTransactionTracking />} />
```

### Step 5 — Update `src/pages/BuyerTransactionDetail.tsx`

**Imports** (top of file): add `useRef` to the react import, add `ContactSellerModal` and `TransactionReceipt` imports

**State** (inside component, after line 223): 
```tsx
const [contactOpen, setContactOpen] = useState(false);
const receiptRef = useRef<HTMLDivElement>(null);
const handlePrint = () => window.print();
```

**5 targeted wiring changes:**
1. Line 289 — Track Order button: add `onClick={() => navigate(\`/dashboard/transactions/${tx.id}/tracking\`)}`
2. Line 304 — Download Receipt dropdown item: add `onClick={handlePrint}`; add new "Print Receipt" item after it
3. Line 528 — Send Message button: add `onClick={() => setContactOpen(true)}`
4. Lines 672–674 — Desktop payment card Download Receipt button: add `onClick={handlePrint}`
5. Lines 760–762 — Mobile payment card Download Receipt button: add `onClick={handlePrint}`

**Render additions** (before closing `</div>` at line 771):
```tsx
<ContactSellerModal
  open={contactOpen}
  onOpenChange={setContactOpen}
  sellerName={seller?.full_name ?? "Seller"}
  transactionId={tx.id}
/>
<TransactionReceipt ref={receiptRef} data={data} />
```

## File Change Summary

| Action | File |
|--------|------|
| Create | `src/components/transactions/ContactSellerModal.tsx` |
| Create | `src/components/transactions/TransactionReceipt.tsx` |
| Create | `src/pages/BuyerTransactionTracking.tsx` |
| Modify | `src/App.tsx` — add import + route |
| Modify | `src/pages/BuyerTransactionDetail.tsx` — 5 wiring changes + 2 render additions |
