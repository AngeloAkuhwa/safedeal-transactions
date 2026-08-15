import {
  LayoutDashboard,
  Receipt,
  Scale,
  IdCard,
  Users,
  PiggyBank,
  Banknote,
  Flag,
  Headphones,
  Bell,
  ScrollText,
  Settings,
  KeyRound,
  ShieldCheck,
  LogOut,
  Inbox,
  ListChecks,
  Gauge,
  Landmark,
} from "lucide-react";
import { useLocation } from "react-router";
import { useAdminNav, isBuiltAdminRoute } from "./useAdminNav";
import { signOut } from "@/services/auth.service";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { permissionForPath } from "@/services/admin-route-permissions";
import { adminDisplayName, adminInitials, adminRoleLabel } from "@/lib/admin-identity";
import type { AdminDashboardResponse } from "@/services/admin-dashboard.service";
import { usePendingApprovalsBadge } from "@/hooks/usePendingApprovalsBadge";

type Badge = {
  count: number;
  tone: "orange" | "purple" | "red" | "yellow" | "cyan";
};

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: Badge;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const BADGE_TONE: Record<Badge["tone"], string> = {
  orange: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  purple: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
  red: "bg-red-500/15 text-red-400 border border-red-500/30",
  yellow: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
};

type SidebarBadges = AdminDashboardResponse["sidebar_badges"] & { access_approvals?: number };

function buildGroups(badges?: SidebarBadges): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Transactions", href: "/admin/transactions", icon: Receipt },
        {
          label: "Disputes",
          href: "/admin/disputes",
          icon: Scale,
          badge: badges ? { count: badges.disputes, tone: "orange" } : undefined,
        },
        {
          label: "Identity",
          href: "/admin/identity",
          icon: IdCard,
          badge: badges ? { count: badges.identity, tone: "purple" } : undefined,
        },
        { label: "Users", href: "/admin/users", icon: Users },
      ],
    },
    {
      label: "Financial",
      items: [
        { label: "Escrow", href: "/admin/escrow", icon: PiggyBank },
        { label: "Reconciliation", href: "/admin/reconciliation", icon: Landmark },
        {
          label: "Payouts",
          href: "/admin/payouts",
          icon: Banknote,
          badge: badges ? { count: badges.payouts, tone: "red" } : undefined,
        },
      ],
    },
    {
      label: "Risk & Compliance",
      items: [
        {
          label: "Flagged Users",
          href: "/admin/flagged-users",
          icon: Flag,
          badge: badges ? { count: badges.flagged_users, tone: "yellow" } : undefined,
        },
      ],
    },
    {
      label: "Support & Tools",
      items: [
        { label: "Support Center", href: "/admin/support", icon: Headphones },
      ],
    },
    {
      label: "Settings",
      items: [
        { label: "Notifications", href: "/admin/notifications", icon: Bell },
        { label: "Platform Settings", href: "/admin/settings", icon: Settings },
      ],
    },
    {
      label: "Administration",
      items: [
        { label: "Users & Access", href: "/admin/access-control", icon: KeyRound },
        {
          label: "Access Approvals",
          href: "/admin/access-approvals",
          icon: Inbox,
          badge: badges?.access_approvals ? { count: badges.access_approvals, tone: "orange" } : undefined,
        },
        { label: "Permission Matrix", href: "/admin/permission-matrix", icon: ShieldCheck },
        { label: "Task Orchestration", href: "/admin/task-orchestration", icon: ListChecks },
        { label: "Agent Performance", href: "/admin/agent-performance", icon: Gauge },
        { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
      ],
    },
  ];
}

interface AdminSidebarProps {
  badges?: AdminDashboardResponse["sidebar_badges"];
  onNavigate?: () => void;
}

export function AdminSidebar({ badges, onNavigate }: AdminSidebarProps) {
  const { go } = useAdminNav();
  const { pathname } = useLocation();
  const { has, isSuper, loading, roles, fullName, email } = useAdminPermissions();
  const displayName = adminDisplayName(fullName, email);
  const initials = adminInitials(fullName, email);
  const roleLabel = adminRoleLabel(roles, isSuper);
  const { count: pendingApprovals } = usePendingApprovalsBadge();
  const badgesWithApprovals: SidebarBadges | undefined = badges
    ? { ...badges, access_approvals: pendingApprovals }
    : (pendingApprovals > 0 ? ({ access_approvals: pendingApprovals } as SidebarBadges) : undefined);
  const rawGroups = buildGroups(badgesWithApprovals);

  // Filter each group by permission: hide items the user can't visit, and
  // drop groups that become empty. During the initial permissions fetch we
  // keep the sidebar collapsed to a single "Dashboard" entry to avoid a
  // flash of screens the user may not have access to.
  const groups = rawGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!isBuiltAdminRoute(item.href)) return false; // "Coming soon" — hide until built
        const required = permissionForPath(item.href);
        if (!required) return true;
        if (loading) return item.href === "/admin/dashboard";
        return isSuper || has(required);
      }),
    }))
    .filter((group) => group.items.length > 0);

  const handleClick = (item: NavItem) => {
    go(item.href, item.label);
    onNavigate?.();
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  return (
    <>
      <aside className="flex h-full w-full flex-col bg-card text-foreground">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500">
            <ShieldCheck className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-tight">SafeDeal</div>
            <div className="text-xs text-muted-foreground">Admin Portal</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => handleClick(item)}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors min-h-11",
                        active
                          ? "border border-blue-500/30 bg-blue-500/10 text-blue-300"
                          : "text-foreground/90 hover:bg-muted/70 hover:text-foreground",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {item.badge && item.badge.count > 0 && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${BADGE_TONE[item.badge.tone]}`}
                        >
                          {item.badge.count}
                        </span>
                      )}
                    </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="flex items-center gap-3 border-t border-border px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-sm font-semibold text-foreground">
            {loading ? <span className="h-3 w-3 rounded-full bg-foreground/30" /> : initials}
          </div>
          <div className="min-w-0 flex-1">
            {loading ? (
              <>
                <div className="h-5 w-28 animate-pulse rounded bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </>
            ) : (
              <>
                <div className="truncate text-sm font-medium leading-5 text-foreground">{displayName}</div>
                <div className="truncate text-xs leading-4 text-muted-foreground">{roleLabel}</div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-11"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}