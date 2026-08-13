import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const actionsSrc = read("supabase/functions/admin-transaction-actions/index.ts");
const helperSrc = read("supabase/functions/_shared/provider-refund.ts");
const coreSrc = read("supabase/functions/_shared/release-core.ts");

describe("dispute resolution actually executes the buyer refund", () => {
  it("admin-transaction-actions imports the shared provider-refund helper", () => {
    expect(actionsSrc).toMatch(
      /import \{ executeProviderRefund \} from "\.\.\/_shared\/provider-refund\.ts"/,
    );
  });

  it("executes the provider refund only for refund outcomes", () => {
    expect(actionsSrc).toMatch(
      /REFUND_OUTCOMES\s*=\s*\["refund_buyer",\s*"dismissed_buyer_favor",\s*"partial_refund_release"\]/,
    );
    expect(actionsSrc).toMatch(
      /REFUND_OUTCOMES\.includes\(outcome\)\s*&&\s*rpcRefundId/,
    );
  });

  it("passes the dispute-decided refund id returned by resolve_dispute_atomic", () => {
    expect(actionsSrc).toMatch(/rpcRefundId = \(rpc as any\)\?\.refund_id/);
    expect(actionsSrc).toMatch(/executeProviderRefund\(admin, rpcRefundId/);
  });

  it("runs the refund AFTER resolve_dispute_atomic and BEFORE the response", () => {
    const rpcIdx = actionsSrc.indexOf('admin.rpc("resolve_dispute_atomic"');
    const execIdx = actionsSrc.indexOf("executeProviderRefund(admin, rpcRefundId");
    const returnIdx = actionsSrc.indexOf("...refundExecution });");
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(execIdx).toBeGreaterThan(rpcIdx);
    expect(returnIdx).toBeGreaterThan(execIdx);
  });

  it("still reports the dispute as resolved when the refund hand-off fails", () => {
    expect(actionsSrc).toMatch(/refund_execution:\s*"failed"/);
    expect(actionsSrc).toMatch(/refund_execution_reason/);
    // the ok:true resolution response is unconditional
    expect(actionsSrc).toMatch(/return json\(\{ ok: true, \.\.\.\(rpc \?\? \{\}\), \.\.\.refundExecution \}\);/);
  });

  it("exposes a permission-gated retry for a stuck dispute refund", () => {
    expect(actionsSrc).toMatch(/retry_dispute_refund:\s*\["refunds\.issue"\]/);
    expect(actionsSrc).toMatch(/case "retry_dispute_refund"/);
    expect(actionsSrc).toMatch(/not_in_refund_pending/);
    expect(actionsSrc).toMatch(/\.in\("status", \["pending", "failed"\]\)/);
  });
});

describe("executeProviderRefund helper", () => {
  it("is idempotent for already handed-off refunds", () => {
    expect(helperSrc).toMatch(
      /currentStatus === "processing" \|\| currentStatus === "refunded" \|\| existingRef/,
    );
  });

  it("uses the most recent succeeded payment reference", () => {
    expect(helperSrc).toMatch(/\.eq\("status", "succeeded"\)/);
    expect(helperSrc).toMatch(/order\("created_at", \{ ascending: false \}\)/);
  });

  it("passes a kobo amount only for partial refunds", () => {
    expect(helperSrc).toMatch(/refundAmount < paymentAmount/);
    expect(helperSrc).toMatch(/isPartial \? \{ amount: nairaToKobo\(refundAmount\) \} : \{\}/);
  });

  it("fails soft: fail_refund_atomic + ops alert, no throw", () => {
    expect(helperSrc).toMatch(/fail_refund_atomic/);
    expect(helperSrc).toMatch(/notifyOpsTeam/);
    expect(helperSrc).toMatch(/error: "paystack_refund_failed"/);
  });

  it("marks the refund row processing with the provider reference", () => {
    expect(helperSrc).toMatch(/status: "processing"/);
    expect(helperSrc).toMatch(/provider_reference: providerRef/);
  });
});

describe("single Paystack refund implementation", () => {
  it("refundBuyerCore delegates its Paystack tail to the helper", () => {
    expect(coreSrc).toMatch(/executeProviderRefund\(admin, refundId/);
    // no direct createRefund call left in release-core
    expect(coreSrc).not.toMatch(/createRefund\(/);
  });
});
