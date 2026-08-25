/**
 * Raw <img> may only ever decrease (plan 6.4).
 *
 * `ProductImage` (components/common/ProductImage.tsx) is the one way to
 * render a product photo: it routes through the SafeDeal Image Standard
 * renditions (square, enhanced, f_auto/q_auto) with srcset and explicit
 * intrinsic size, so the layout never shifts and a phone never downloads a
 * desktop-sized original. A raw <img src={product.image_url}> does none of
 * that, and 52 of them shipped before the primitive existed.
 *
 * Measured again after the first classification pass: of those 52, only
 * four were ever product photos a rendition could serve (a product hero,
 * a top-products thumbnail, a transaction item photo, and one already
 * converted). The rest are avatars, uploaded dispute evidence, local
 * pre-submit previews, deliberate full-size lightboxes, a QR code and
 * two static brand assets. Every surviving entry below now carries the
 * reason it stays raw, so the list stops reading as 48 pending defects
 * and starts reading as what it is: an inventory with four conversions
 * done and the remainder deliberate.
 *
 * Not every <img> is a defect: QR codes, receipt scans, dispute evidence,
 * avatars and static brand art are not product photos and stay raw on
 * purpose. This guard cannot tell those apart, and does not try. What it
 * can do is hold the inventory: every file's raw <img> count is recorded
 * below, a rise fails (a new raw <img> needs a deliberate decision), and
 * the migration PRs shrink entries as they classify each site. The
 * staleness check forces the list to track reality in both directions, so
 * a converted site cannot silently leave headroom behind.
 *
 * Blind spot, written down per house rule 3: this counts the literal text
 * "<img" after comment stripping. An <img> assembled by createElement or
 * hidden in a string would not be seen. None exists today; if one
 * appears, teach the walk to see it rather than trusting this note.
 *
 * The stripper counts ALL block comments, not only the `{/* … *\/}` JSX
 * form, because the narrower version had already produced a false
 * positive: `PurchaseAuthModal` was converted to `ProductImage` in #41
 * and its migration note says so in a plain `/* … *\/` comment inside a
 * ternary branch. The word `<img` in that sentence kept the file on the
 * debt list, so a finished conversion still read as outstanding work.
 * A guard that miscounts in the safe direction still lies about how
 * much is left.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** The legitimate definition sites: one primitive per kind of image. */
const DEFINITIONS = [
  "components/common/ProductImage.tsx",
  "components/common/UserAvatar.tsx",
];

const RAW_IMG_DEBT = new Map<string, number>([
  ["components/admin/transactions/EvidencePreviewDialog.tsx", 1], // evidence
  ["components/auth/BrandedAuthSplash.tsx", 1], // asset (brand logo)
  ["components/disputes/BuyerClaimSection.tsx", 2], // evidence
  ["components/disputes/DeliveryProofSection.tsx", 1], // evidence
  ["components/disputes/SellerResponseSection.tsx", 1], // evidence
  ["components/pwa/InstallPrompt.tsx", 1], // asset (PWA icon)
  ["components/security/TwoFactorDialog.tsx", 1], // qr
  ["components/seller-disputes/SellerEvidenceSection.tsx", 1], // evidence
  ["components/seller-disputes/SellerResponseForm.tsx", 1], // upload
  ["components/seller-disputes/SellerViewBuyerClaim.tsx", 1], // evidence
  ["components/seller/DispatchForm.tsx", 1], // upload
  ["components/transactions/ContactSellerModal.tsx", 1], // upload
  ["components/transactions/ProductMediaGallery.tsx", 3], // renditions inline + lightbox
  ["components/verification/DisputeForm.tsx", 2], // upload
  ["pages/AdminAuditLogs.tsx", 1], // avatar
  ["pages/AdminDisputeDetail.tsx", 2], // evidence + lightbox
  ["pages/AdminNotifications.tsx", 2], // avatar
  ["pages/BuyerTransactionDetail.tsx", 3], // evidence + avatar
  ["pages/BuyerTransactionReview.tsx", 1], // avatar
  ["pages/BuyerTransactionTracking.tsx", 3], // lightbox + evidence + avatar
  ["pages/SellerCreateTransaction.tsx", 1], // upload
  ["pages/SellerProductCreate.tsx", 1], // upload
  ["pages/SellerUpdateDelivery.tsx", 1], // upload
]);

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("raw <img> only ever decreases", () => {
  const counts = new Map<string, number>();
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    if (rel.startsWith("__tests__") || DEFINITIONS.includes(rel)) continue;
    const n = stripComments(fs.readFileSync(file, "utf8")).split("<img").length - 1;
    if (n) counts.set(rel, n);
  }

  it("every definition site still exists and renders an img", () => {
    for (const def of DEFINITIONS) {
      const src = fs.readFileSync(path.join(ROOT, def), "utf8");
      expect(src.includes("<img"), `${def} no longer renders an <img>`).toBe(true);
    }
  });

  it("no file exceeds its recorded raw <img> count", () => {
    const over: string[] = [];
    for (const [rel, n] of counts) {
      const allowed = RAW_IMG_DEBT.get(rel) ?? 0;
      if (n > allowed) over.push(`${rel}: ${n} raw <img>, recorded ${allowed}`);
    }
    expect(
      over,
      "A raw <img> was added. Product photos go through ProductImage " +
        "(components/common/ProductImage.tsx); a deliberately raw image " +
        "(QR code, receipt, evidence, avatar, brand art) raises its entry " +
        "here with a comment saying why.\n" + over.join("\n"),
    ).toEqual([]);
  });

  it("the debt list shrinks with reality (no stale headroom)", () => {
    const stale: string[] = [];
    for (const [rel, allowed] of RAW_IMG_DEBT) {
      const n = counts.get(rel) ?? 0;
      if (n < allowed) stale.push(`${rel}: recorded ${allowed}, actually ${n}; lower or remove the entry`);
    }
    expect(stale, "Converted sites must leave the list:\n" + stale.join("\n")).toEqual([]);
  });
});
