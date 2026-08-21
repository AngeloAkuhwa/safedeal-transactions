/**
 * Dev-only data-consistency check between the Admin Transaction Monitor row
 * and the Admin Transaction Detail page. In production this is a no-op so it
 * has zero cost.
 *
 * It compares the 16 user-visible fields enumerated in the
 * Monitor↔Detail consistency spec and emits a single grouped console.warn
 * per mismatch. No UI is rendered.
 */

import {
  mapTransactionStatus,
  mapMoneyStatus,
  mapDisputeStatus,
  mapEscrowState,
  mapPayoutStatus,
  mapRiskLevel,
  formatCurrencyNGN,
} from "./admin-mappers";

export interface MonitorRowSnapshot {
  transactionId: string;
  transactionCode?: string | null;
  itemTitle?: string | null;
  buyerName?: string | null;
  sellerName?: string | null;
  amount?: number | null;
  protectionFee?: number | null;
  sellerNetAmount?: number | null;
  /** Needed to render money in the diff output without inventing a currency. */
  currencyCode?: string | null;
  transactionStatus?: { key?: string; label?: string; raw?: string };
  moneyStatus?: { key?: string; label?: string; raw?: string };
  disputeStatus?: { key?: string; label?: string; raw?: string };
  escrowStatus?: { key?: string; label?: string; raw?: string };
  riskLevel?: string;
  flags?: string[];
  lastActivityAt?: string | null;
  paymentProvider?: string | null;
  payoutStatus?: string | null;
}

export interface DetailPayloadShape {
  transaction: {
    id: string;
    transactionCode: string;
    status: string;
    moneyStatus: string;
    disputeStatus?: string | null;
    lastActivityAt?: string | null;
    needsAdminReview?: boolean | null;
  };
  parties?: { buyer?: { name?: string | null } | null; seller?: { name?: string | null } | null };
  items?: Array<{ title?: string | null }>;
  pricing?: {
    buyerTotal?: number | null;
    protectionFee?: number | null;
    sellerNet?: number | null;
    currencyCode?: string | null;
  } | null;
  payment?: { provider?: string | null } | null;
  payout?: { status?: string | null } | null;
  escrow?: { state?: string | null } | null;
  risk?: { level?: string; flags?: Array<{ label: string }> } | null;
}

export function assertMonitorDetailConsistent(
  monitor: MonitorRowSnapshot | null | undefined,
  detail: DetailPayloadShape | null | undefined,
): void {
  if (!import.meta.env.DEV) return;
  if (!monitor || !detail) return;

  const issues: Array<{ field: string; monitor: unknown; detail: unknown }> = [];
  const monCur = monitor.currencyCode ?? "";
  const detCur = detail.pricing?.currencyCode ?? "";
  const same = (a: unknown, b: unknown) =>
    a == null && b == null ? true : String(a ?? "") === String(b ?? "");
  const close = (a: number | null | undefined, b: number | null | undefined) => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(Number(a) - Number(b)) < 0.005;
  };

  // 1. transaction id
  if (!same(monitor.transactionId, detail.transaction.id)) {
    issues.push({ field: "transactionId", monitor: monitor.transactionId, detail: detail.transaction.id });
  }
  // 2. transaction code
  if (!same(monitor.transactionCode, detail.transaction.transactionCode)) {
    issues.push({ field: "transactionCode", monitor: monitor.transactionCode, detail: detail.transaction.transactionCode });
  }
  // 3. item title
  const detailItem = detail.items?.[0]?.title ?? null;
  if (monitor.itemTitle && detailItem && !same(monitor.itemTitle, detailItem)) {
    issues.push({ field: "itemTitle", monitor: monitor.itemTitle, detail: detailItem });
  }
  // 4. buyer name
  if (monitor.buyerName && detail.parties?.buyer?.name && !same(monitor.buyerName, detail.parties.buyer.name)) {
    issues.push({ field: "buyerName", monitor: monitor.buyerName, detail: detail.parties.buyer.name });
  }
  // 5. seller name
  if (monitor.sellerName && detail.parties?.seller?.name && !same(monitor.sellerName, detail.parties.seller.name)) {
    issues.push({ field: "sellerName", monitor: monitor.sellerName, detail: detail.parties.seller.name });
  }
  // 6. total amount
  if (!close(monitor.amount, detail.pricing?.buyerTotal)) {
    issues.push({
      field: "totalAmount",
      monitor: formatCurrencyNGN(monitor.amount ?? null, monCur),
      detail: formatCurrencyNGN(detail.pricing?.buyerTotal ?? null, detCur),
    });
  }
  // 7. protection fee. Monitor sums platform + processing; detail exposes only platform
  if (monitor.protectionFee != null && detail.pricing?.protectionFee != null) {
    // tolerate the well-known monitor=platform+processing vs detail=platform shape
    const okExact = close(monitor.protectionFee, detail.pricing.protectionFee);
    if (!okExact && monitor.protectionFee < detail.pricing.protectionFee) {
      issues.push({
        field: "protectionFee",
        monitor: formatCurrencyNGN(monitor.protectionFee, monCur),
        detail: formatCurrencyNGN(detail.pricing.protectionFee, detCur),
      });
    }
  }
  // 8. seller net
  if (!close(monitor.sellerNetAmount, detail.pricing?.sellerNet)) {
    issues.push({
      field: "sellerNetAmount",
      monitor: formatCurrencyNGN(monitor.sellerNetAmount ?? null, monCur),
      detail: formatCurrencyNGN(detail.pricing?.sellerNet ?? null, detCur),
    });
  }
  // 9-12. statuses. Compare canonical keys (not labels), since monitor uses
  // short labels and detail uses long labels intentionally.
  const txKeyMon = monitor.transactionStatus?.key ?? mapTransactionStatus(monitor.transactionStatus?.raw).key;
  const txKeyDet = mapTransactionStatus(detail.transaction.status).key;
  if (!same(txKeyMon, txKeyDet)) {
    issues.push({ field: "transactionStatus", monitor: txKeyMon, detail: txKeyDet });
  }
  const mnKeyMon = monitor.moneyStatus?.key ?? mapMoneyStatus(monitor.moneyStatus?.raw).key;
  const mnKeyDet = mapMoneyStatus(detail.transaction.moneyStatus).key;
  if (!same(mnKeyMon, mnKeyDet)) {
    issues.push({ field: "moneyStatus", monitor: mnKeyMon, detail: mnKeyDet });
  }
  const dsKeyMon = monitor.disputeStatus?.key ?? mapDisputeStatus(monitor.disputeStatus?.raw).key;
  const dsKeyDet = mapDisputeStatus(detail.transaction.disputeStatus ?? "none").key;
  if (!same(dsKeyMon, dsKeyDet)) {
    issues.push({ field: "disputeStatus", monitor: dsKeyMon, detail: dsKeyDet });
  }
  const esKeyMon = monitor.escrowStatus?.key ?? mapEscrowState(monitor.escrowStatus?.raw ?? null).key;
  const esKeyDet = mapEscrowState(detail.escrow?.state ?? null).key;
  if (!same(esKeyMon, esKeyDet)) {
    issues.push({ field: "escrowStatus", monitor: esKeyMon, detail: esKeyDet });
  }
  // 13. risk flags / level
  if (monitor.riskLevel) {
    const detailLevel =
      detail.risk?.level ??
      mapRiskLevel({
        needsReleaseReview: detail.transaction.needsAdminReview,
        moneyStatus: detail.transaction.moneyStatus,
        disputeStatus: detail.transaction.disputeStatus,
      }).level;
    if (!same(monitor.riskLevel, detailLevel)) {
      issues.push({ field: "riskLevel", monitor: monitor.riskLevel, detail: detailLevel });
    }
  }
  // 14. last activity (allow ±5min skew)
  if (monitor.lastActivityAt && detail.transaction.lastActivityAt) {
    const a = new Date(monitor.lastActivityAt).getTime();
    const b = new Date(detail.transaction.lastActivityAt).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 5 * 60 * 1000) {
      issues.push({ field: "lastActivity", monitor: monitor.lastActivityAt, detail: detail.transaction.lastActivityAt });
    }
  }
  // 15. payment provider
  if (monitor.paymentProvider && detail.payment?.provider && !same(monitor.paymentProvider, detail.payment.provider)) {
    issues.push({ field: "paymentProvider", monitor: monitor.paymentProvider, detail: detail.payment.provider });
  }
  // 16. payout status
  if (monitor.payoutStatus && detail.payout?.status) {
    const a = mapPayoutStatus(monitor.payoutStatus).key;
    const b = mapPayoutStatus(detail.payout.status).key;
    if (!same(a, b)) {
      issues.push({ field: "payoutStatus", monitor: a, detail: b });
    }
  }

  if (issues.length === 0) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `%c[admin-consistency] %c${monitor.transactionCode ?? monitor.transactionId}. ${issues.length} mismatch${issues.length > 1 ? "es" : ""}`,
    "color:#f59e0b;font-weight:600",
    "color:inherit",
  );
  for (const i of issues) {
    // eslint-disable-next-line no-console
    console.warn(i.field, { monitor: i.monitor, detail: i.detail });
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}