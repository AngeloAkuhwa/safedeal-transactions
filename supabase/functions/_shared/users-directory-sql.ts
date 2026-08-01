/**
 * SQL-backed paginator for the User Directory. Uses the
 * `admin_users_directory_page` and `admin_users_directory_summary` RPCs
 * instead of scanning the entire profiles universe in JS.
 *
 * Wire shape mirrors the JS engine's DirRow / DirSummary so existing UI
 * consumers do not need changes.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { DirRow, DirRole, DirStatus, DirVerification, DirSummary, DirFilters } from "./users-directory-engine.ts";

const SORT_MAP: Record<string, string> = {
  recent: "joined_desc",
  joined_desc: "joined_desc",
  joined_asc: "joined_asc",
  name: "name_asc",
  name_asc: "name_asc",
  transactions: "txcount_desc",
  txcount_desc: "txcount_desc",
  volume: "volume_desc",
  volume_desc: "volume_desc",
  disputes: "disputes_desc",
  disputes_desc: "disputes_desc",
  active: "active_desc",
  active_desc: "active_desc",
};

function mapRow(r: Record<string, unknown>): DirRow {
  const uid = String(r.user_id);
  const idStatus = (r.id_status as string | null) ?? null;
  const emailV = !!r.email_verified;
  const phoneV = !!r.phone_verified;
  const idV = !!r.identity_verified;
  let level: DirVerification = "none";
  if (idV && emailV && phoneV) level = "fully";
  else if (idV) level = "id";
  else if (phoneV) level = "phone";
  else if (emailV) level = "email";
  const email = (r.email as string) ?? "";
  const publicUserId = String(r.public_user_id ?? "");
  const handle = "@" + (email.split("@")[0] || publicUserId.replace("USR-", "").toLowerCase());
  const roles = ((r.roles as string[] | null) ?? []) as DirRole[];
  const txCount = Number(r.tx_count ?? 0);
  const dispActive = Number(r.disp_active ?? 0);
  const status = (r.derived_status as DirStatus) ?? "active";
  const trust_badge: DirRow["trust_badge"] =
    r.is_flagged || r.is_suspended ? "flagged"
    : (level === "fully" && txCount >= 10 && dispActive === 0) ? "trusted_seller"
    : status === "pending" ? "pending"
    : null;

  return {
    user_id: uid,
    display_id: publicUserId,
    full_name: (r.full_name as string) ?? "Unknown user",
    handle,
    email,
    phone: (r.phone as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    roles,
    verification: { level, email: emailV, phone: phoneV, id: idV, id_status: idStatus },
    transactions: {
      count: txCount,
      resolved: Number(r.tx_resolved ?? 0),
      volume: Number(r.tx_volume ?? 0),
      currency: "NGN",
    },
    disputes: { total: Number(r.disp_total ?? 0), active: dispActive },
    status,
    trust_badge,
    joined_at: (r.joined_at as string | null) ?? null,
    last_active_at: (r.last_active_at as string | null) ?? null,
    is_suspended: !!r.is_suspended,
    is_flagged: !!r.is_flagged,
    has_open_investigation: !!r.has_investigation,
  };
}

export async function getDirectoryPage(
  admin: SupabaseClient,
  filters: DirFilters,
  sort: string,
  page: number,
  pageSize: number,
): Promise<{ rows: DirRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await admin.rpc("admin_users_directory_page", {
    _search: filters.q || null,
    _role: filters.role !== "all" ? filters.role : null,
    _status: filters.status !== "all" ? filters.status : null,
    _verification: filters.verification !== "all" ? filters.verification : null,
    _sort: SORT_MAP[sort] ?? "joined_desc",
    _from: from,
    _to: to,
  });
  if (error) throw error;
  const raw = (data ?? []) as Record<string, unknown>[];
  const total = raw.length > 0 ? Number(raw[0].total_count ?? 0) : 0;
  const rows = raw.map(mapRow);
  // NOTE: the RPC currently ignores the `range` filter (join-date window);
  // apply that in-page for backwards compatibility. Volume is small (pageSize).
  let out = rows;
  if (filters.range && filters.range !== "all") {
    const days = filters.range === "7d" ? 7 : filters.range === "30d" ? 30 : 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    out = out.filter((r) => r.joined_at && new Date(r.joined_at).getTime() >= cutoff);
  }
  return { rows: out, total };
}

export async function getDirectorySummary(admin: SupabaseClient): Promise<DirSummary> {
  const { data, error } = await admin.rpc("admin_users_directory_summary");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const total = Number(row?.total_users ?? 0);
  const idV = Number(row?.id_verified ?? 0);
  const emailV = Number(row?.email_verified ?? 0);
  const fully = Number(row?.fully_verified ?? 0);
  const flagged = Number(row?.flagged_users ?? 0);
  const newWeek = Number(row?.new_this_week ?? 0);
  const newMonth = Number(row?.new_this_month ?? 0);
  const verified = fully + Math.max(0, idV - fully); // rows counted as "verified" ~ id or fully
  return {
    total_users: total,
    verified_users: verified,
    verification_rate: total > 0 ? Math.round((verified / total) * 1000) / 10 : 0,
    flagged_users: flagged,
    new_this_week: newWeek,
    id_verified: idV,
    email_verified: emailV,
    new_this_month: newMonth,
    new_per_day_avg: Math.round(newWeek / 7),
    id_verified_pct: total > 0 ? Math.round((idV / total) * 1000) / 10 : 0,
    deltas: {
      total: newWeek > 0 ? `+${newWeek} this week` : "No change",
      verified: total > 0 ? `${Math.round((verified / total) * 100)}% rate` : "—",
      flagged: flagged > 0 ? "Requires review" : "Clear",
      new_week: `${Math.round(newWeek / 7)}/day avg`,
      id: total > 0 ? `${Math.round((idV / total) * 100)}% of total` : "—",
      email: total > 0 ? `${Math.round((emailV / total) * 100)}% of total` : "—",
    },
  };
}