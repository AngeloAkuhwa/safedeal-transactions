/**
 * Read-only User Directory aggregator. Pulls profiles + auth metadata
 * (via service-role), roles, identity status, transaction counts/volume,
 * dispute counts, and admin flag/suspend status. No mutations.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type DirRole = "buyer" | "seller" | "business" | "admin";
export type DirStatus = "active" | "flagged" | "suspended" | "pending" | "under_investigation";
export type DirVerification = "fully" | "id" | "phone" | "email" | "none";

export interface DirRow {
  user_id: string;
  display_id: string;
  full_name: string;
  handle: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  roles: DirRole[];
  verification: {
    level: DirVerification;
    email: boolean;
    phone: boolean;
    id: boolean;
    id_status: string | null;
  };
  transactions: { count: number; resolved: number; volume: number; currency: "NGN" };
  disputes: { total: number; active: number };
  status: DirStatus;
  trust_badge: "trusted_seller" | "flagged" | "pending" | null;
  joined_at: string | null;
  last_active_at: string | null;
  is_suspended: boolean;
  is_flagged: boolean;
  has_open_investigation: boolean;
}

export interface DirSummary {
  total_users: number;
  verified_users: number;
  verification_rate: number;
  flagged_users: number;
  new_this_week: number;
  id_verified: number;
  email_verified: number;
  new_this_month: number;
  new_per_day_avg: number;
  id_verified_pct: number;
  deltas: { total: string; verified: string; flagged: string; new_week: string; id: string; email: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function relative(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function deriveVerification(idStatus: string | null, emailVerified: boolean, phoneVerified: boolean): {
  level: DirVerification; email: boolean; phone: boolean; id: boolean;
} {
  const idOk = idStatus === "approved" || idStatus === "verified";
  if (idOk && emailVerified && phoneVerified) return { level: "fully", email: true, phone: true, id: true };
  if (idOk) return { level: "id", email: emailVerified, phone: phoneVerified, id: true };
  if (phoneVerified) return { level: "phone", email: emailVerified, phone: true, id: false };
  if (emailVerified) return { level: "email", email: true, phone: phoneVerified, id: false };
  return { level: "none", email: false, phone: phoneVerified, id: false };
}

export interface DirFilters {
  q: string;
  role: "all" | DirRole;
  status: "all" | DirStatus;
  verification: "all" | DirVerification;
  range: "all" | "7d" | "30d" | "90d";
}

export async function buildDirectory(admin: SupabaseClient): Promise<DirRow[]> {
  // 1) Profiles (universe)
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, full_name, email, phone, avatar_url, status, default_role, created_at, updated_at, last_login_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (profErr) console.error("profiles_select_failed", profErr);
  const ids = (profiles ?? []).map((p) => p.id as string);
  if (!ids.length) return [];

  // 2) Roles
  const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", ids);
  const rolesByUser = new Map<string, Set<DirRole>>();
  for (const r of roles ?? []) {
    const uid = r.user_id as string;
    const role = r.role as DirRole;
    if (!rolesByUser.has(uid)) rolesByUser.set(uid, new Set());
    rolesByUser.get(uid)!.add(role);
  }

  // 3) Latest identity submission per user
  const { data: idsubs } = await admin
    .from("identity_submissions")
    .select("user_id, status, updated_at")
    .in("user_id", ids)
    .order("updated_at", { ascending: false })
    .limit(5000);
  const idStatusByUser = new Map<string, string>();
  for (const s of idsubs ?? []) {
    const uid = s.user_id as string;
    if (!idStatusByUser.has(uid)) idStatusByUser.set(uid, (s.status as string) ?? "");
  }

  // 4) Auth users (for email_confirmed_at)
  const emailConfirmedByUser = new Map<string, boolean>();
  try {
    // pull in pages
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        if (ids.includes(u.id)) emailConfirmedByUser.set(u.id, !!u.email_confirmed_at);
      }
      if (data.users.length < 1000) break;
      page++;
      if (page > 5) break;
    }
  } catch (_e) { /* best effort */ }

  // 4b) account_verifications (phone/email/identity flags)
  const phoneVerifiedByUser = new Map<string, boolean>();
  const emailVerifiedFromAcct = new Map<string, boolean>();
  const idVerifiedFromAcct = new Map<string, boolean>();
  const { data: avs } = await admin
    .from("account_verifications")
    .select("user_id, email_verified, phone_verified, identity_verified")
    .in("user_id", ids);
  for (const a of avs ?? []) {
    const uid = a.user_id as string;
    phoneVerifiedByUser.set(uid, !!a.phone_verified);
    emailVerifiedFromAcct.set(uid, !!a.email_verified);
    idVerifiedFromAcct.set(uid, !!a.identity_verified);
  }

  // 5) Transactions count + volume per user (as buyer or seller)
  const txByUser = new Map<string, { count: number; resolved: number; volume: number }>();
  const FUNDED = new Set([
    "payment_secured", "seller_preparing_delivery", "seller_dispatched",
    "delivered_awaiting_verification", "disputed", "resolved", "completed", "refunded",
  ]);
  const RESOLVED_STATES = new Set(["completed", "resolved", "refunded"]);
  const { data: txs, error: txErr } = await admin
    .from("transactions")
    .select("id, buyer_id, seller_id, status")
    .not("status", "in", "(draft,cancelled,timed_out)")
    .limit(20000);
  if (txErr) console.error("transactions_select_failed", txErr);
  const txIds = (txs ?? []).map((t) => t.id as string);
  const amtByTx = new Map<string, number>();
  if (txIds.length) {
    const { data: pricing } = await admin
      .from("transaction_pricing")
      .select("transaction_id, buyer_total_amount")
      .in("transaction_id", txIds);
    for (const p of pricing ?? []) {
      amtByTx.set(p.transaction_id as string, Number(p.buyer_total_amount ?? 0));
    }
  }
  for (const t of txs ?? []) {
    const status = (t.status as string) ?? "";
    const amount = FUNDED.has(status) ? (amtByTx.get(t.id as string) ?? 0) : 0;
    for (const uid of [t.buyer_id, t.seller_id].filter(Boolean) as string[]) {
      if (!ids.includes(uid)) continue;
      const cur = txByUser.get(uid) ?? { count: 0, resolved: 0, volume: 0 };
      cur.count++;
      cur.volume += amount;
      if (RESOLVED_STATES.has(status)) cur.resolved++;
      txByUser.set(uid, cur);
    }
  }

  // 6) Disputes per user
  const dispByUser = new Map<string, { total: number; active: number }>();
  const { data: disp } = await admin
    .from("disputes")
    .select("transaction_id, status")
    .limit(20000);
  const dispTxIds = Array.from(new Set((disp ?? []).map((d) => d.transaction_id as string).filter(Boolean)));
  const partsByTx = new Map<string, { buyer: string | null; seller: string | null }>();
  if (dispTxIds.length) {
    const { data: parts } = await admin
      .from("transactions").select("id, buyer_id, seller_id").in("id", dispTxIds);
    for (const t of parts ?? []) partsByTx.set(t.id as string,
      { buyer: t.buyer_id as string | null, seller: t.seller_id as string | null });
  }
  for (const d of disp ?? []) {
    const p = partsByTx.get(d.transaction_id as string);
    if (!p) continue;
    const isActive = !["resolved", "closed", "cancelled"].includes((d.status as string) ?? "");
    for (const uid of [p.buyer, p.seller].filter(Boolean) as string[]) {
      if (!ids.includes(uid)) continue;
      const cur = dispByUser.get(uid) ?? { total: 0, active: 0 };
      cur.total++;
      if (isActive) cur.active++;
      dispByUser.set(uid, cur);
    }
  }

  // 7) Admin flags & investigations
  const flagsByUser = new Map<string, { flagged: boolean; suspended: boolean; investigation: boolean; clearedAt: number; flaggedAt: number }>();
  const { data: actions } = await admin
    .from("admin_actions")
    .select("target_user_id, action_type, created_at")
    .in("target_user_id", ids)
    .order("created_at", { ascending: false })
    .limit(5000);
  for (const a of actions ?? []) {
    const uid = a.target_user_id as string;
    const at = a.action_type as string;
    const ts = new Date(a.created_at as string).getTime();
    const cur = flagsByUser.get(uid) ?? { flagged: false, suspended: false, investigation: false, clearedAt: 0, flaggedAt: 0 };
    if (at === "clear_flag" || at === "unflag_user" || at === "close_case") {
      if (ts > cur.clearedAt) cur.clearedAt = ts;
    } else if (at === "unsuspend_user") {
      cur.suspended = false;
    } else if (at === "suspend_user") {
      cur.suspended = true;
      if (ts > cur.flaggedAt) cur.flaggedAt = ts;
    } else if (at === "flag_user" || at === "flag_for_review") {
      cur.flagged = true;
      if (ts > cur.flaggedAt) cur.flaggedAt = ts;
    } else if (at === "open_investigation" || at === "escalate_case") {
      cur.investigation = true;
      if (ts > cur.flaggedAt) cur.flaggedAt = ts;
    }
    flagsByUser.set(uid, cur);
  }
  for (const [uid, f] of flagsByUser) {
    if (f.clearedAt > f.flaggedAt) {
      f.flagged = false;
      f.investigation = false;
    }
  }

  const rows: DirRow[] = [];
  for (const p of profiles ?? []) {
    const uid = p.id as string;
    const userRoles = Array.from(rolesByUser.get(uid) ?? new Set<DirRole>());
    if (userRoles.length === 0) {
      const def = (p.default_role as DirRole | null);
      if (def) userRoles.push(def);
    }
    const idStatus = idStatusByUser.get(uid) ?? null;
    const emailVerified = emailConfirmedByUser.get(uid) ?? emailVerifiedFromAcct.get(uid) ?? false;
    // Phone verification source-of-truth is account_verifications; fall back to false
    const phoneVerified = phoneVerifiedByUser.get(uid) ?? false;
    const v = deriveVerification(idStatus, emailVerified, phoneVerified);
    const flags = flagsByUser.get(uid);
    const profileStatus = (p.status as string) ?? null;
    const isSuspended = !!flags?.suspended || profileStatus === "suspended" || profileStatus === "blocked";
    const isFlagged = !!flags?.flagged;
    const hasInvestigation = !!flags?.investigation;
    const tx = txByUser.get(uid) ?? { count: 0, resolved: 0, volume: 0 };
    const dp = dispByUser.get(uid) ?? { total: 0, active: 0 };

    const idPendingReview = idStatus === "pending" || idStatus === "submitted" || idStatus === "in_review";
    const status: DirStatus = isSuspended ? "suspended"
      : hasInvestigation ? "under_investigation"
      : isFlagged ? "flagged"
      : idPendingReview ? "pending"
      : "active";

    const trust_badge: DirRow["trust_badge"] =
      isFlagged || isSuspended ? "flagged"
      : (v.level === "fully" && tx.count >= 10 && dp.active === 0) ? "trusted_seller"
      : status === "pending" ? "pending"
      : null;

    const email = (p.email as string) ?? "";
    const handle = "@" + (email.split("@")[0] || uid.slice(0, 8));

    rows.push({
      user_id: uid,
      display_id: `USR-${uid.slice(0, 8).toUpperCase()}`,
      full_name: (p.full_name as string) ?? "Unknown user",
      handle,
      email,
      phone: (p.phone as string) ?? null,
      avatar_url: (p.avatar_url as string) ?? null,
      roles: userRoles,
      verification: { ...v, id_status: idStatus },
      transactions: { count: tx.count, resolved: tx.resolved, volume: tx.volume, currency: "NGN" },
      disputes: dp,
      status,
      trust_badge,
      joined_at: (p.created_at as string) ?? null,
      last_active_at: ((p as Record<string, unknown>).last_login_at as string | null) ?? (p.updated_at as string) ?? null,
      is_suspended: isSuspended,
      is_flagged: isFlagged,
      has_open_investigation: hasInvestigation,
    });
  }

  return rows;
}

export function summarize(rows: DirRow[]): DirSummary {
  const total = rows.length;
  const verified = rows.filter((r) => r.verification.level === "fully" || r.verification.level === "id").length;
  const flagged = rows.filter((r) => r.status === "flagged" || r.status === "under_investigation").length;
  const weekAgo = Date.now() - 7 * DAY_MS;
  const newWeek = rows.filter((r) => r.joined_at && new Date(r.joined_at).getTime() >= weekAgo).length;
  const monthAgo = Date.now() - 30 * DAY_MS;
  const newMonth = rows.filter((r) => r.joined_at && new Date(r.joined_at).getTime() >= monthAgo).length;
  const idVerified = rows.filter((r) => r.verification.id).length;
  const emailVerified = rows.filter((r) => r.verification.email).length;
  return {
    total_users: total,
    verified_users: verified,
    verification_rate: total > 0 ? Math.round((verified / total) * 1000) / 10 : 0,
    flagged_users: flagged,
    new_this_week: newWeek,
    id_verified: idVerified,
    email_verified: emailVerified,
    new_this_month: newMonth,
    new_per_day_avg: Math.round(newWeek / 7),
    id_verified_pct: total > 0 ? Math.round((idVerified / total) * 1000) / 10 : 0,
    deltas: {
      total: newWeek > 0 ? `+${newWeek} this week` : "No change",
      verified: total > 0 ? `${Math.round((verified / total) * 100)}% rate` : "—",
      flagged: flagged > 0 ? "Requires review" : "Clear",
      new_week: `${Math.round(newWeek / 7)}/day avg`,
      id: total > 0 ? `${Math.round((idVerified / total) * 100)}% of total` : "—",
      email: total > 0 ? `${Math.round((emailVerified / total) * 100)}% of total` : "—",
    },
  };
}

export function applyFilters(rows: DirRow[], f: DirFilters): DirRow[] {
  let out = rows;
  if (f.role !== "all") out = out.filter((r) => r.roles.includes(f.role as DirRole));
  if (f.status !== "all") out = out.filter((r) => r.status === f.status);
  if (f.verification !== "all") out = out.filter((r) => r.verification.level === f.verification);
  if (f.range !== "all") {
    const days = f.range === "7d" ? 7 : f.range === "30d" ? 30 : 90;
    const cutoff = Date.now() - days * DAY_MS;
    out = out.filter((r) => r.joined_at && new Date(r.joined_at).getTime() >= cutoff);
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter((r) =>
      r.full_name.toLowerCase().includes(q)
      || r.email.toLowerCase().includes(q)
      || (r.phone ?? "").toLowerCase().includes(q)
      || r.display_id.toLowerCase().includes(q)
      || r.user_id.toLowerCase().includes(q)
      || r.handle.toLowerCase().includes(q));
  }
  return out;
}

export function sortRows(rows: DirRow[], sort: string) {
  rows.sort((a, b) => {
    if (sort === "name") return a.full_name.localeCompare(b.full_name);
    if (sort === "transactions") return b.transactions.count - a.transactions.count;
    if (sort === "disputes") return b.disputes.active - a.disputes.active;
    // recent (default)
    const at = a.joined_at ? new Date(a.joined_at).getTime() : 0;
    const bt = b.joined_at ? new Date(b.joined_at).getTime() : 0;
    return bt - at;
  });
}

export { relative as relativeLabel };