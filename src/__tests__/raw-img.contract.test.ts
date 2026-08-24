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
 * "<img" after JSX comment stripping. An <img> assembled by createElement
 * or hidden in a string would not be seen. None exists today; if one
 * appears, teach the walk to see it rather than trusting this note.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** The one legitimate definition site. */
const DEFINITION = "components/common/ProductImage.tsx";

const RAW_IMG_DEBT = new Map<string, number>([
  ["components/admin/escrow/EscrowRecordsTable.tsx", 1],
  ["components/admin/flagged-users/UserAvatar.tsx", 1],
  ["components/admin/payouts/PayoutDetailDrawer.tsx", 1],
  ["components/admin/task-orchestration/AgentLoadCard.tsx", 1],
  ["components/admin/task-orchestration/LiveTaskProgression.tsx", 1],
  ["components/admin/task-orchestration/ProductivityInsights.tsx", 1],
  ["components/admin/task-orchestration/drawers/AgentDetailsDrawer.tsx", 1],
  ["components/admin/task-orchestration/drawers/AssignTaskDrawer.tsx", 1],
  ["components/admin/transactions/EvidencePreviewDialog.tsx", 1],
  ["components/admin/users/UserDetailDrawer.tsx", 1],
  ["components/admin/users/UsersMobileFeed.tsx", 1],
  ["components/admin/users/UsersTable.tsx", 1],
  ["components/auth/BrandedAuthSplash.tsx", 1],
  ["components/disputes/BuyerClaimSection.tsx", 2],
  ["components/disputes/DeliveryProofSection.tsx", 1],
  ["components/disputes/SellerResponseSection.tsx", 1],
  ["components/pwa/InstallPrompt.tsx", 1],
  ["components/security/TwoFactorDialog.tsx", 1],
  ["components/seller-disputes/SellerEvidenceSection.tsx", 1],
  ["components/seller-disputes/SellerResponseForm.tsx", 1],
  ["components/seller-disputes/SellerViewBuyerClaim.tsx", 1],
  ["components/seller/DispatchForm.tsx", 1],
  ["components/storefront/PurchaseAuthModal.tsx", 1],
  ["components/transactions/ContactSellerModal.tsx", 1],
  ["components/transactions/ProductMediaGallery.tsx", 3],
  ["components/verification/DisputeForm.tsx", 2],
  ["pages/AdminAuditLogs.tsx", 1],
  ["pages/AdminDisputeDetail.tsx", 3],
  ["pages/AdminDisputes.tsx", 1],
  ["pages/AdminNotifications.tsx", 2],
  ["pages/AdminTransactionDetail.tsx", 2],
  ["pages/AdminUserDetail.tsx", 1],
  ["pages/BuyerTransactionDetail.tsx", 3],
  ["pages/BuyerTransactionReview.tsx", 1],
  ["pages/BuyerTransactionTracking.tsx", 3],
  ["pages/SellerAnalytics.tsx", 1],
  ["pages/SellerCreateTransaction.tsx", 1],
  ["pages/SellerProductCreate.tsx", 1],
  ["pages/SellerProductPreview.tsx", 1],
  ["pages/SellerUpdateDelivery.tsx", 1],
]);

const stripJsxComments = (s: string) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

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
    if (rel.startsWith("__tests__") || rel === DEFINITION) continue;
    const n = stripJsxComments(fs.readFileSync(file, "utf8")).split("<img").length - 1;
    if (n) counts.set(rel, n);
  }

  it("the definition site still exists and renders an img", () => {
    const src = fs.readFileSync(path.join(ROOT, DEFINITION), "utf8");
    expect(src.includes("<img"), `${DEFINITION} no longer renders an <img>`).toBe(true);
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
