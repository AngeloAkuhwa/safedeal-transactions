// Access Control Management service.
// Backend edge functions for internal-user access are not yet wired; this
// service returns deterministic mock data so the UI is fully interactive.
// Swap the internal `fetchMock` calls for real edge-function calls when the
// backend endpoints ship — the exported types are the contract to hold to.

export type InternalRole =
  | "super_admin"
  | "admin"
  | "senior_agent"
  | "agent"
  | "junior_agent"
  | "read_only";

export type AccessLevel = "full" | "elevated" | "high" | "standard" | "limited";

export type InternalUserStatus = "active" | "suspended" | "pending" | "invited";

export interface InternalUser {
  id: string;
  display_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: InternalRole;
  access_level: AccessLevel;
  status: InternalUserStatus;
  last_active_at: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  created_by?: string | null;
  department?: string | null;
  permissions: string[];
}

export interface AccessSummary {
  active_admins: number;
  admins_delta_week: number;
  active_agents: number;
  agents_delta_week: number;
  suspended_users: number;
  suspended_delta_week: number;
  full_access_users: number;
}

export type AccessFilter =
  | "all"
  | "admins"
  | "agents"
  | "suspended"
  | "critical";

export interface AccessDirectoryQuery {
  filter?: AccessFilter;
  q?: string;
}

export interface AccessDirectoryResponse {
  summary: AccessSummary;
  rows: InternalUser[];
}

export interface AccessAuditEntry {
  id: string;
  user_id: string;
  actor_name: string;
  action: string;
  detail: string;
  created_at: string;
  severity: "info" | "warning" | "critical";
}

// ---------- MOCK STORE ----------

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

const MOCK_USERS: InternalUser[] = [
  {
    id: "u_1", display_id: "ADM-001",
    full_name: "Sarah Chen", email: "sarah.chen@safedeal.com",
    avatar_url: null, role: "super_admin", access_level: "full",
    status: "active", last_active_at: iso(2 * 60_000),
    two_factor_enabled: true, created_at: iso(400 * 86_400_000),
    department: "Platform Security",
    permissions: ["*"],
  },
  {
    id: "u_2", display_id: "ADM-002",
    full_name: "Michael Rodriguez", email: "michael.r@safedeal.com",
    avatar_url: null, role: "admin", access_level: "high",
    status: "active", last_active_at: iso(15 * 60_000),
    two_factor_enabled: true, created_at: iso(300 * 86_400_000),
    department: "Trust & Safety",
    permissions: ["users.manage", "disputes.manage", "payouts.review"],
  },
  {
    id: "u_3", display_id: "AGT-015",
    full_name: "Emma Thompson", email: "emma.t@safedeal.com",
    avatar_url: null, role: "senior_agent", access_level: "standard",
    status: "active", last_active_at: iso(60 * 60_000),
    two_factor_enabled: true, created_at: iso(180 * 86_400_000),
    department: "Customer Support",
    permissions: ["disputes.view", "disputes.respond", "users.view"],
  },
  {
    id: "u_4", display_id: "AGT-032",
    full_name: "James Wilson", email: "james.w@safedeal.com",
    avatar_url: null, role: "agent", access_level: "limited",
    status: "active", last_active_at: iso(3 * 60 * 60_000),
    two_factor_enabled: false, created_at: iso(120 * 86_400_000),
    department: "Customer Support",
    permissions: ["disputes.view", "users.view"],
  },
  {
    id: "u_5", display_id: "ADM-007",
    full_name: "Olivia Martins", email: "olivia.m@safedeal.com",
    avatar_url: null, role: "admin", access_level: "elevated",
    status: "suspended", last_active_at: iso(6 * 86_400_000),
    two_factor_enabled: true, created_at: iso(500 * 86_400_000),
    department: "Finance Ops",
    permissions: ["payouts.approve", "escrow.review"],
  },
  {
    id: "u_6", display_id: "AGT-041",
    full_name: "Daniel Ade", email: "daniel.a@safedeal.com",
    avatar_url: null, role: "junior_agent", access_level: "limited",
    status: "pending", last_active_at: null,
    two_factor_enabled: false, created_at: iso(2 * 86_400_000),
    department: "Customer Support",
    permissions: ["disputes.view"],
  },
  {
    id: "u_7", display_id: "ADM-003",
    full_name: "Priya Nair", email: "priya.n@safedeal.com",
    avatar_url: null, role: "super_admin", access_level: "full",
    status: "active", last_active_at: iso(9 * 60_000),
    two_factor_enabled: true, created_at: iso(600 * 86_400_000),
    department: "Engineering",
    permissions: ["*"],
  },
];

const MOCK_AUDIT: AccessAuditEntry[] = [
  { id: "a1", user_id: "u_2", actor_name: "Sarah Chen",
    action: "role_changed", detail: "Promoted to Admin", severity: "warning",
    created_at: iso(2 * 86_400_000) },
  { id: "a2", user_id: "u_5", actor_name: "System",
    action: "user_suspended", detail: "Suspended after 3 failed policy checks",
    severity: "critical", created_at: iso(6 * 86_400_000) },
  { id: "a3", user_id: "u_3", actor_name: "Michael Rodriguez",
    action: "permission_granted", detail: "Added disputes.respond",
    severity: "info", created_at: iso(10 * 86_400_000) },
];

function passesFilter(u: InternalUser, f: AccessFilter): boolean {
  if (f === "admins") return u.role === "admin" || u.role === "super_admin";
  if (f === "agents") return u.role === "senior_agent" || u.role === "agent" || u.role === "junior_agent";
  if (f === "suspended") return u.status === "suspended";
  if (f === "critical") return u.access_level === "full" || u.access_level === "elevated";
  return true;
}

function buildSummary(users: InternalUser[]): AccessSummary {
  const admins = users.filter((u) => (u.role === "admin" || u.role === "super_admin") && u.status === "active").length;
  const agents = users.filter((u) => (u.role === "senior_agent" || u.role === "agent" || u.role === "junior_agent") && u.status === "active").length;
  const suspended = users.filter((u) => u.status === "suspended").length;
  const full = users.filter((u) => u.access_level === "full").length;
  return {
    active_admins: admins, admins_delta_week: 2,
    active_agents: agents, agents_delta_week: 5,
    suspended_users: suspended, suspended_delta_week: -1,
    full_access_users: full,
  };
}

async function delay<T>(v: T, ms = 250): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms));
}

export async function fetchAccessDirectory(q: AccessDirectoryQuery = {}): Promise<AccessDirectoryResponse> {
  const filter = q.filter ?? "all";
  const search = (q.q ?? "").trim().toLowerCase();
  const rows = MOCK_USERS.filter((u) => passesFilter(u, filter)).filter((u) => {
    if (!search) return true;
    return [u.full_name, u.email, u.display_id, u.role, u.department ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  return delay({ summary: buildSummary(MOCK_USERS), rows });
}

export async function fetchAccessAudit(userId: string): Promise<AccessAuditEntry[]> {
  return delay(MOCK_AUDIT.filter((a) => a.user_id === userId));
}

export interface ChangeRoleInput { user_id: string; role: InternalRole; access_level: AccessLevel; reason: string; }
export async function changeRole(input: ChangeRoleInput): Promise<void> {
  const u = MOCK_USERS.find((x) => x.id === input.user_id);
  if (u) { u.role = input.role; u.access_level = input.access_level; }
  await delay(null);
}

export interface UpdatePermissionsInput { user_id: string; permissions: string[]; reason: string; }
export async function updatePermissions(input: UpdatePermissionsInput): Promise<void> {
  const u = MOCK_USERS.find((x) => x.id === input.user_id);
  if (u) u.permissions = input.permissions;
  await delay(null);
}

export interface SuspendInput { user_id: string; reason: string; }
export async function suspendInternalUser(input: SuspendInput): Promise<void> {
  const u = MOCK_USERS.find((x) => x.id === input.user_id);
  if (u) u.status = "suspended";
  await delay(null);
}
export async function reactivateInternalUser(input: SuspendInput): Promise<void> {
  const u = MOCK_USERS.find((x) => x.id === input.user_id);
  if (u) u.status = "active";
  await delay(null);
}

export interface InviteUserInput {
  full_name: string;
  email: string;
  role: InternalRole;
  access_level: AccessLevel;
  department?: string;
  require_2fa: boolean;
}
export async function inviteInternalUser(input: InviteUserInput): Promise<InternalUser> {
  const rolePrefix = input.role === "admin" || input.role === "super_admin" ? "ADM" : "AGT";
  const seq = String(MOCK_USERS.length + 1).padStart(3, "0");
  const u: InternalUser = {
    id: `u_${Date.now()}`,
    display_id: `${rolePrefix}-${seq}`,
    full_name: input.full_name,
    email: input.email,
    avatar_url: null,
    role: input.role,
    access_level: input.access_level,
    status: "invited",
    last_active_at: null,
    two_factor_enabled: input.require_2fa,
    created_at: new Date().toISOString(),
    department: input.department ?? null,
    permissions: [],
  };
  MOCK_USERS.unshift(u);
  return delay(u);
}

// ---------- PRESENTATION HELPERS ----------

export const ROLE_LABEL: Record<InternalRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_agent: "Senior Agent",
  agent: "Agent",
  junior_agent: "Junior Agent",
  read_only: "Read Only",
};

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  full: "Full Access",
  elevated: "Elevated Access",
  high: "High Access",
  standard: "Standard Access",
  limited: "Limited Access",
};

export const STATUS_LABEL: Record<InternalUserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  pending: "Pending",
  invited: "Invited",
};

export function accessDotClass(level: AccessLevel): string {
  switch (level) {
    case "full": return "bg-red-400";
    case "elevated": return "bg-orange-400";
    case "high": return "bg-amber-400";
    case "standard": return "bg-blue-400";
    case "limited": return "bg-emerald-400";
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.round(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export const PERMISSION_CATALOG: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  { group: "Users", items: [
    { key: "users.view", label: "View user directory" },
    { key: "users.manage", label: "Manage users & roles" },
    { key: "users.suspend", label: "Suspend / reactivate users" },
  ]},
  { group: "Disputes", items: [
    { key: "disputes.view", label: "View disputes" },
    { key: "disputes.respond", label: "Respond to disputes" },
    { key: "disputes.manage", label: "Manage & resolve disputes" },
  ]},
  { group: "Payments & Escrow", items: [
    { key: "payouts.review", label: "Review payouts" },
    { key: "payouts.approve", label: "Approve payouts" },
    { key: "escrow.review", label: "Review escrow ledger" },
    { key: "escrow.adjust", label: "Adjust escrow entries" },
  ]},
  { group: "Platform", items: [
    { key: "settings.view", label: "View platform settings" },
    { key: "settings.manage", label: "Manage platform settings" },
    { key: "audit.view", label: "View audit logs" },
  ]},
];