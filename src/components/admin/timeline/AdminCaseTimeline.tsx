import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared "case timeline" renderer used by both the Admin Dispute Detail
 * and Admin Transaction Detail pages, so both surfaces show the same
 * dispute / investigation / freeze / unfreeze / admin-action history with
 * the same labels and tone.
 *
 * Input: the `timeline` array returned by the `admin-transaction-detail`
 * edge function — each entry has { id, at, type, title, description,
 * actorType, actorName, severity, icon }.
 *
 * This component is *history only*. It must never feed any active state
 * flag — those derive from `deriveActiveState`.
 */

export interface AdminTimelineEntry {
  id: string;
  at: string;
  type: string;
  title: string;
  description?: string | null;
  actorType?: string | null;
  actorName?: string | null;
  severity?: string | null;
  icon?: string | null;
  subtype?: string | null;
}

const DISPUTE_RELEVANT_TYPES = new Set([
  "dispute",
  "dispute_opened",
  "dispute_under_review",
  "dispute_escalated",
  "dispute_resolved",
  "dispute_evidence_uploaded",
  "seller_response_submitted",
  "buyer_evidence_uploaded",
  "admin_action",
  "money_status",
  "payment",
  "payout",
  "escrow_ledger",
  "delivery",
  "transaction_status",
  "event",
]);

const TIMELINE_TONE: Record<string, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  muted: "bg-muted-foreground/60",
};

const titleCase = (s?: string | null) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

function parseRawTokens(desc: string): string {
  if (!desc) return "";
  let out = desc;
  out = out.replace(/\[target=([a-z0-9_]+)\]\s*/gi, (_m, v) => `Target: ${titleCase(v)} · `);
  out = out.replace(
    /\[([a-z_]+)\/([a-z_]+)\]\s*/gi,
    (_m, src, pri) => `Source: ${titleCase(src)} · Priority: ${titleCase(pri)} · `,
  );
  out = out.replace(/follow_up:([a-z_]+)\s*/gi, (_m, lvl) => `Follow-up (${lvl}): `);
  out = out.replace(/\b([a-z_]+)\/([a-z_]+)\b/g, (m, a, b) => {
    const stat = ["resolved", "open", "under_review", "escalated", "closed", "pending"].includes(a);
    const pri = ["low", "medium", "high", "urgent", "critical"].includes(b);
    return stat && pri ? `Status: ${titleCase(a)} · Priority: ${titleCase(b)}` : m;
  });
  return out.replace(/\s*·\s*$/, "").trim();
}

interface HumanizedRow {
  title: string;
  description: string;
  tone: string;
  actor: string | null;
  sortKey: string;
}

function humanize(e: AdminTimelineEntry): HumanizedRow {
  const t = e.type ?? "";
  const rawTitle = e.title ?? "";
  const rawDesc = e.description ?? "";
  const lower = rawTitle.toLowerCase().trim();
  let title = rawTitle;
  let tone = "blue";
  const description = parseRawTokens(rawDesc);
  const actor = e.actorName ?? null;

  if (t === "dispute_opened" || lower === "dispute opened" || lower === "dispute: open") {
    title = "Dispute opened";
    tone = "red";
  } else if (
    t === "dispute_resolved" ||
    lower.includes("resolved") ||
    lower === "dispute: resolved"
  ) {
    title = "Dispute resolved";
    tone = "green";
  } else if (lower.includes("under review") || t === "dispute_under_review") {
    title = "Dispute: under review";
    tone = "blue";
  } else if (
    lower.includes("seller response pending") ||
    lower.includes("seller_response_pending")
  ) {
    title = "Dispute: seller response pending";
    tone = "blue";
  } else if (lower === "escalate case" || lower.includes("escalate")) {
    title = "Case escalated";
    tone = "orange";
  } else if (
    lower === "update investigation" ||
    lower.includes("investigation update") ||
    lower.includes("update_investigation")
  ) {
    title = "Investigation updated";
    tone = "blue";
  } else if (lower.includes("open investigation") || lower.includes("open_investigation")) {
    title = "Investigation opened";
    tone = "orange";
  } else if (lower.includes("resolve investigation") || lower.includes("investigation resolved")) {
    title = "Investigation resolved";
    tone = "green";
  } else if (lower.includes("dismiss investigation")) {
    title = "Investigation dismissed";
    tone = "muted";
  } else if (lower === "add internal note" || lower.includes("internal note")) {
    title = "Internal note added";
    tone = "blue";
  } else if (
    lower.includes("freeze transaction") ||
    lower.includes("freeze_transaction") ||
    lower === "freeze funds"
  ) {
    title = "Funds frozen by admin";
    tone = "red";
  } else if (lower.includes("unfreeze")) {
    title = "Funds unfrozen by admin";
    tone = "green";
  } else if (t === "seller_response_submitted") {
    title = "Seller response submitted";
    tone = "blue";
  } else if (t === "buyer_evidence_uploaded") {
    title = "Evidence uploaded by buyer";
    tone = "blue";
  } else if (t === "dispute_evidence_uploaded") {
    title = `Evidence uploaded${actor ? ` by ${actor}` : ""}`;
    tone = "blue";
  } else if (t === "money_status") {
    title = `Money: ${rawTitle.replace(/^Money[:\s-]*/i, "").trim() || titleCase(e.subtype ?? "")}`;
    tone = "blue";
  } else if (t === "escrow_ledger") {
    title = "Escrow adjustment";
    tone = "blue";
  }

  if (e.severity === "success") tone = "green";
  if (e.severity === "critical" && tone === "blue") tone = "red";

  return { title, description, tone, actor, sortKey: e.at ?? "" };
}

/** Collapse admin freeze/unfreeze action with the matching money_status +
 *  escrow_ledger rows that happen within ±5s into a single timeline row. */
function collapseAdminTriplets(items: AdminTimelineEntry[]): AdminTimelineEntry[] {
  const sorted = [...items].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const used = new Set<string>();
  const out: AdminTimelineEntry[] = [];
  for (const it of sorted) {
    if (used.has(it.id)) continue;
    const isFreeze =
      it.type === "admin_action" && /freeze|unfreeze/i.test(it.title ?? "");
    if (!isFreeze) {
      out.push(it);
      continue;
    }
    const tMs = new Date(it.at).getTime();
    const companions = sorted.filter(
      (x) =>
        !used.has(x.id) &&
        x.id !== it.id &&
        (x.type === "money_status" || x.type === "escrow_ledger") &&
        Math.abs(new Date(x.at).getTime() - tMs) <= 5000,
    );
    companions.forEach((c) => used.add(c.id));
    const extra = companions.length ? " · Escrow adjustment recorded" : "";
    out.push({
      ...it,
      description: `${(it.description ?? "").trim()}${extra}`.trim(),
    });
  }
  return out;
}

function dedupe(items: AdminTimelineEntry[]): AdminTimelineEntry[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.type}|${i.at}|${i.actorName ?? ""}|${i.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statusPillColor(
  status: string,
  resolvedAt: string | null,
): { label: string; tone: string } {
  if (resolvedAt || status === "resolved" || status === "closed" || status === "dismissed") {
    return { label: "Resolved", tone: "green" };
  }
  if (status === "escalated") return { label: "Escalated", tone: "orange" };
  if (status === "under_review") return { label: "Under review", tone: "orange" };
  if (status === "open") return { label: "Open", tone: "red" };
  return { label: titleCase(status) || "Active", tone: "blue" };
}

export interface AdminCaseTimelineProps {
  items: AdminTimelineEntry[];
  /** Optional header pill — pass dispute status + resolvedAt. */
  disputeStatus?: string | null;
  resolvedAt?: string | null;
  /** Only show dispute-relevant rows (used by Dispute Detail page). */
  filterDisputeOnly?: boolean;
  /** Cap rendered rows; defaults to no limit. */
  maxRows?: number;
}

export function AdminCaseTimeline({
  items,
  disputeStatus,
  resolvedAt,
  filterDisputeOnly = false,
  maxRows,
}: AdminCaseTimelineProps) {
  const prepared = useMemo(() => {
    const base = filterDisputeOnly
      ? items.filter((i) => DISPUTE_RELEVANT_TYPES.has(i.type))
      : items;
    const deduped = dedupe(base);
    return collapseAdminTriplets(deduped);
  }, [items, filterDisputeOnly]);

  const rows = useMemo(() => {
    const sorted = prepared
      .map((e) => ({ raw: e, ...humanize(e) }))
      .sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime());
    return typeof maxRows === "number" ? sorted.slice(0, maxRows) : sorted;
  }, [prepared, maxRows]);

  const header = disputeStatus ? statusPillColor(disputeStatus, resolvedAt ?? null) : null;

  if (rows.length === 0 && !header) {
    return <div className="text-xs text-muted-foreground">No timeline events yet.</div>;
  }

  return (
    <div className="space-y-4">
      {header && (
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", TIMELINE_TONE[header.tone])} />
          <span
            className={cn(
              "text-sm font-semibold",
              header.tone === "green" && "text-emerald-300",
              header.tone === "orange" && "text-orange-300",
              header.tone === "red" && "text-red-300",
              header.tone === "blue" && "text-blue-300",
            )}
          >
            {header.label}
          </span>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.raw.id} className="border-l-2 border-border/60 pl-4 py-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0 -ml-[21px]",
                TIMELINE_TONE[r.tone],
              )}
            />
            <div className="text-sm font-semibold text-foreground">{r.title}</div>
          </div>
          {r.description && (
            <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
          )}
          <div className="text-[12px] text-muted-foreground mt-1.5">
            {fmtDate(r.raw.at)}
            {r.raw.type === "admin_action" && <> · by {r.actor ?? "SafeDeal Admin"}</>}
          </div>
        </div>
      ))}
    </div>
  );
}