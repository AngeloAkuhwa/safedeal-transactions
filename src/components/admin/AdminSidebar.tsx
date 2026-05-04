import {
  LayoutDashboard,
  Receipt,
  Scale,
  IdCard,
  Users,
  Search,
  PiggyBank,
  Banknote,
  CreditCard,
  Activity,
  Flag,
  UserX,
  ShieldAlert,
  FileCheck2,
  Headphones,
  Bug,
  Download,
  Bell,
  ScrollText,
  Settings,
  KeyRound,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminNav, isBuiltAdminRoute } from "./useAdminNav";
import { signOut } from "@/services/auth.service";
import type { AdminDashboardResponse } from "@/services/admin-dashboard.service";

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

function buildGroups(badges?: AdminDashboardResponse["sidebar_badges"]): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }],
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
        { label: "Investigation", href: "/admin/investigation", icon: Search },
      ],
    },
    {
      label: "Financial",
      items: [
        { label: "Escrow", href: "/admin/escrow", icon: PiggyBank },
        {
          label: "Payouts",
          href: "/admin/payouts",
          icon: Banknote,
          badge: badges ? { count: badges.payouts, tone: "red" } : undefined,
        },
        { label: "Payments", href: "/admin/payments", icon: CreditCard },
        { label: "Money Tracing", href: "/admin/money-tracing", icon: Activity },
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
        { label: "Impersonation", href: "/admin/impersonation", icon: UserX },
        { label: "Fraud Detection", href: "/admin/fraud", icon: ShieldAlert },
        { label: "Compliance", href: "/admin/compliance", icon: FileCheck2 },
      ],
    },
    {
      label: "Support & Tools",
      items: [
        { label: "Support Center", href: "/admin/support", icon: Headphones },
        { label: "Debug Tools", href: "/admin/debug", icon: Bug },
        {
          label: "Exports",
          href: "/admin/exports",
          icon: Download,
          badge: badges ? { count: badges.exports, tone: "cyan" } : undefined,
        },
      ],
    },
    {
      label: "Settings",
      items: [
        { label: "Notifications", href: "/admin/notifications", icon: Bell },
        { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
        { label: "Platform Settings", href: "/admin/settings", icon: Settings },
        { label: "Access Control", href: "/admin/access-control", icon: KeyRound },
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
  const groups = buildGroups(badges);

  const handleClick = (item: NavItem) => {
    go(item.href, item.label);
    onNavigate?.();
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  return (
    <TooltipProvider delayDuration={150}>
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
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  const built = isBuiltAdminRoute(item.href);
                  const row = (
                    <button
                      type="button"
                      onClick={() => handleClick(item)}
                      aria-current={active ? "page" : undefined}
                      aria-disabled={!built}
                      className={[
                        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "border border-blue-500/30 bg-blue-500/10 text-blue-300"
                          : built
                            ? "text-foreground/90 hover:bg-muted/70 hover:text-foreground"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {item.badge && item.badge.count > 0 && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONE[item.badge.tone]}`}
                        >
                          {item.badge.count}
                        </span>
                      )}
                    </button>
                  );
                  return (
                    <li key={item.href}>
                      {built ? (
                        row
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>{row}</TooltipTrigger>
                          <TooltipContent side="right" className="border-border bg-muted text-foreground">
                            Coming soon
                          </TooltipContent>
                        </Tooltip>
                      )}
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
            A
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">Admin User</div>
            <div className="truncate text-xs text-muted-foreground">Super Admin</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}