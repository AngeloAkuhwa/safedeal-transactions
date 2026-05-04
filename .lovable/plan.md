## What's wrong right now

### 1. Dispute Evidence tiles look "broken"
The right-rail "Dispute Evidence" list renders each row's 48×48 tile as a real `<img>` pointing at the Cloudinary `secure_url`. For this transaction the evidence list contains:

- a PNG image (Cloudinary `image/upload` URL) — loads fine
- a **PDF** (`application/pdf`) — but the tile still tries to render it as an image when the kind heuristic gets confused, producing a browser "broken image" glyph
- an **MP4 video** (`video/upload` URL) — same problem

The mockup (`Transaction_Detail_2-3.html`, lines 861–896) shows every row as a flat gray square with a single icon — no thumbnails. So we should drop the inline `<img>` thumbnails entirely and use the typed icon, then let the **preview dialog** load the actual file (image / video / PDF) at full size.

### 2. PDF previews must actually work in the dialog
`EvidencePreviewDialog` already has a PDF branch (`<iframe src=...#toolbar=0>`), but two things make it fail in practice:

- `isPdf` only checks `mime === "application/pdf"`. If the file row's `mimeType` is missing (older uploads), or the kind was inferred as `"document"` from `evidence_type`, we fall through to the `UnsupportedFallback` even though the URL ends in `.pdf`.
- Cloudinary's raw delivery sometimes serves PDFs with `Content-Disposition: attachment`, which makes browsers download instead of preview inside the iframe.

Both need a small fix so PDFs in the dispute documents always render inline.

### 3. Small remaining drift from the design
While re-reading the mockup against the live page I found two more small mismatches:

- **Risk Assessment leading tile** is currently triggered by `risk.level in {high, escalated} || frozen || disputeOverdue`. It accidentally hides on transactions where risk is mid but a dispute exists. Broaden to: show whenever `risk.flags.length > 0`, a dispute exists, or funds are frozen.
- **Linked Records → Payment card** in the mockup shows a small monospace fragment of the payment reference under the provider name (`pi_3Om...`). Ours doesn't.
- **Admin extras** chevron does not rotate when opened — missing `group` + `group-open:rotate-180`.

The "Show full timeline" link **stays as-is** per request.

## Fix plan

### A. Dispute Evidence list (`src/pages/AdminTransactionDetail.tsx`)

1. Stop rendering remote `<img>` thumbnails in the list rows. Each tile becomes the same flat `w-12 h-12 rounded-lg bg-muted flex items-center justify-center` square with one icon centered, picked by `evidenceIcon(ev.kind, ev.mimeType)` (icon resolver upgraded to also use mime as a tiebreaker so a PDF always shows the file icon, a video always shows the video icon, etc.).
2. Keep the click → open `EvidencePreviewDialog` behaviour for **all** rows, including PDFs, videos, and images. The dialog is where the real preview happens.
3. Drop role/eye-icon residue. Each row shows only `title` and `fmtDate(uploadedAt)`.
4. If `secureUrl` is null, render the row but disable the click and append a small "Unavailable" suffix (so no dead dialog opens).
5. **Keep the "Show full timeline" link** exactly as it is today (per user request) — no changes to the timeline card.

### B. PDF preview reliability (`src/components/admin/transactions/EvidencePreviewDialog.tsx`)

6. Broaden the `isPdf` check to also catch URL-based hints:
   `isPdf = mime === "application/pdf" || /\.pdf(\?|$)/i.test(url ?? "") || item?.evidenceType === "pdf"`.
7. For Cloudinary `raw/upload` PDFs, force inline display by appending `fl_attachment:false` (Cloudinary URL transformation) when the host is `res.cloudinary.com` and the path contains `/raw/upload/` or `/image/upload/` with `.pdf`. This makes the browser render the PDF in the iframe instead of downloading it.
8. Keep the existing `<iframe src="${url}#toolbar=0&navpanes=0">` rendering — this works in Chrome/Edge/Safari for all inline-served PDFs.
9. As an extra safety net, if the iframe `onError` fires, swap to a small "Open PDF in new tab" link plus a download-blocked notice (so admins always have a path to view, never a hard dead-end).
10. Mirror the same broadened detection in the small `UnsupportedFallback` icon picker so PDFs show the document icon, not the generic file icon.

### C. Small design polish (`src/pages/AdminTransactionDetail.tsx`)

11. Risk Assessment leading "High Risk Transaction / ESCALATED" tile: change visibility to `risk.flags.length > 0 || hasDispute || frozen`.
12. Linked Records Payment card: add a muted `font-mono text-xs text-muted-foreground` line under the provider showing `truncateRef(paymentReference)` (first 8 chars + `…` when longer). No-op when reference is missing.
13. Admin extras `<details>`: add `group` to the `<details>` element and `group-open:rotate-180 transition-transform` on the chevron.

## Files touched

- `src/pages/AdminTransactionDetail.tsx` — evidence list cleanup, risk tile trigger, payment ref snippet, admin-extras chevron animation.
- `src/components/admin/transactions/EvidencePreviewDialog.tsx` — broaden PDF detection, force Cloudinary inline delivery, add iframe error fallback.
- No service or edge-function changes.

## Acceptance

- Dispute Evidence list shows flat icon tiles for every row — no broken-image glyphs, no remote `<img>` requests in that list.
- Clicking any row (image, video, **PDF**, document) opens `EvidencePreviewDialog` and the file renders inline (image preview, playable video, scrollable PDF).
- PDFs hosted on Cloudinary render inside the dialog's iframe instead of triggering a download.
- If a PDF iframe fails to load, the dialog shows a clear "Open in new tab" fallback link.
- Rows with no resolvable file URL render an "Unavailable" suffix and are not clickable.
- Risk Assessment column always opens with the red "High Risk Transaction / ESCALATED" tile when there are risk flags, an active dispute, or frozen funds.
- Linked Records Payment card shows a small monospace reference snippet under the provider.
- Admin extras chevron rotates 180° when opened.
- "Show full timeline" link remains in place on all viewports — unchanged.
- Mobile (<lg) layout unchanged.
