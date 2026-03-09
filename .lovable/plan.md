
## What exists vs. what needs to be built

**Current state:**
- `BuyerTransactionDetail.tsx` — fully implemented, 880 lines. Has "Track Order" button (line 289-291, no navigation wired), "Send Message to Seller" button (line 528-530, no modal), and "Download Receipt" buttons (lines 304, 673, 761, no action wired)
- `ContactSellerModal.tsx` — does NOT exist yet
- `TransactionReceipt.tsx` — does NOT exist yet  
- `BuyerTransactionTracking.tsx` — does NOT exist yet
- `App.tsx` — no tracking route added yet

## Files to create

### 1. `src/components/transactions/ContactSellerModal.tsx`
A Dialog modal triggered when "Send Message to Seller" is clicked:
- Seller name in header
- Textarea for message body (required, min 10 chars)
- File upload zone: click-to-browse or drag-drop, accepts images + PDFs up to 10MB, shows file chips with remove buttons
- Send button with loading state → shows sonner toast on success/error
- For now, message sending is mocked (toast success) — no edge function needed

Props: `open`, `onOpenChange`, `sellerName`, `transactionId`

### 2. `src/components/transactions/TransactionReceipt.tsx`
A visually hidden, print-optimized component:
- Takes the full `TransactionDetailResponse` data as props
- Receipt header: SafeDeal logo text, "Official Receipt", transaction code, date
- Item section: title, qty, condition, category, description
- Pricing breakdown: item price, platform fee, processing fee, total
- Seller info: name, member since
- Delivery address if available
- Footer: "Protected by SafeDeal Escrow"
- Styled with `@media print` via inline styles so it's invisible on screen but renders on print

Export a `printReceipt(ref)` helper that calls `window.print()`.

### 3. `src/pages/BuyerTransactionTracking.tsx`
New full page with route `/dashboard/transactions/:transactionId/tracking`:
- Reuses `getTransactionDetail()` (same data, no new edge function needed)
- **Nav + breadcrumb**: BuyerNav → "Back to Transaction Details" link
- **Trust banner**: Shield icon + escrow status message
- **Transaction header**: item title, status badge, money badge, tx code + date
- **Horizontal 8-step progress timeline**: Draft → Awaiting Payment → Payment Secured → Preparing → Dispatched → Delivered → Verification → Completed. Uses icons in circles connected by lines, colored by current status.
- **Next Action card** (reuse logic from detail page)
- **Delivery Tracking card**: courier name, tracking number, shipped/expected dates, external "Track Package" button if `tracking_url` exists
- **Delivery Evidence grid**: photo thumbnails from `delivery_proof_files`, click to enlarge (simple lightbox)
- **Full Transaction Timeline**: vertical step-by-step log using `status_history`, showing timestamps + labels
- **Right sidebar**: Item details summary, Seller info card, Payment summary, Help card ("Need help? Contact Support")
- Mobile-first responsive layout (stack on mobile, 2/3 + 1/3 grid on desktop)

## Files to modify

### `src/App.tsx`
Add tracking route inside the `requireRole="buyer"` block:
```
<Route path="/dashboard/transactions/:transactionId/tracking" element={<BuyerTransactionTracking />} />
```

### `src/pages/BuyerTransactionDetail.tsx`
Four targeted changes:
1. **Imports**: Add `useRef`, import `ContactSellerModal`, `TransactionReceipt`, `useNavigate` already imported
2. **State**: Add `const [contactOpen, setContactOpen] = useState(false)` and `const receiptRef = useRef<HTMLDivElement>(null)`
3. **Track Order button** (line 289-291): Add `onClick={() => navigate(\`/dashboard/transactions/${tx.id}/tracking\`)}`
4. **Download Receipt** dropdown item (line 304): Add `onClick={() => { window.print(); }}` and render `<TransactionReceipt ref={receiptRef} data={data} />`
5. **Send Message button** (line 528-530): Add `onClick={() => setContactOpen(true)}`; render `<ContactSellerModal open={contactOpen} onOpenChange={setContactOpen} sellerName={seller?.full_name ?? "Seller"} transactionId={tx.id} />` after the closing `</div>` of the Contact Seller card
6. **All "Download Receipt" buttons** (lines 673, 761): Add `onClick` handlers
7. **Print receipt** dropdown item: Add "Print Receipt" menu item

## Implementation order
1. Create `ContactSellerModal.tsx`
2. Create `TransactionReceipt.tsx`
3. Create `BuyerTransactionTracking.tsx`
4. Update `App.tsx` (add route + import)
5. Update `BuyerTransactionDetail.tsx` (wire all three features)
