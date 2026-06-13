import type { PayoutRow } from "@/services/admin-payouts.service";

function esc(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportPayoutsCsv(rows: PayoutRow[], filename = `payouts-${new Date().toISOString().slice(0,10)}.csv`) {
  const headers = [
    "Payout ID","Status","Amount","Currency","Seller","Seller Email",
    "Transaction Code","Item","Money Status","Bank","Account",
    "Bank Verified","Failure Reason","Provider Reference","Queued At","Released At",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.status, r.amount, r.currency,
      r.seller?.name ?? "", r.seller?.email ?? "",
      r.transaction?.code ?? "", r.transaction?.item_title ?? "", r.transaction?.money_status ?? "",
      r.payout_account?.bank_name ?? "", r.payout_account?.masked_account ?? "",
      r.payout_account?.verification_status ?? "",
      r.failure_reason ?? "", r.provider_reference ?? "",
      r.entered_queue_at ?? "", r.released_at ?? "",
    ].map(esc).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
