import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Shield, Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { onAuthStateChange, getSession, signOut } from "@/services/auth.service";
import { getUserRoles } from "@/services/role.service";
import { invalidateOldSessions } from "@/services/session.service";
import { toast } from "@/components/ui/sonner";
import type { User } from "@supabase/supabase-js";

const navLinks = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Protection", href: "#protection" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [dashboardPath, setDashboardPath] = useState("/role-selection");
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
    });
    getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session) {
        const { data: roles } = await getUserRoles(session.user.id);
        const roleNames = (roles ?? []).map((r) => r.role);
        if (roleNames.includes("buyer")) {
          setDashboardPath("/dashboard");
        } else if (roleNames.includes("seller")) {
          setDashboardPath("/seller");
        } else {
          setDashboardPath("/role-selection");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      if (user) {
        await invalidateOldSessions(user.id);
      }
      await signOut();
      toast.success("Signed out successfully");
      navigate("/", { replace: true });
    } catch {
      toast.error("Failed to sign out. Please try again.");
    }
  };

  return (
    <header className="safe-top sticky top-0 z-sticky w-full border-b border-border/80 bg-background/85 shadow-sm backdrop-blur-md">
      <div className="container-x mx-auto flex h-14 max-w-7xl items-center justify-between sm:h-16 lg:h-20">
        <Link to="/" className="flex items-center gap-2.5 min-h-11">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-md sm:h-10 sm:w-10 lg:h-11 lg:w-11">
            <Shield className="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground sm:text-xl lg:text-2xl">
            SafeDeal
          </span>
        </Link>

        {/*
          Desktop nav.

          `inline-flex min-h-11 items-center` rather than a bare inline link:
          these were 20px tall boxes, so "FAQ" was a 27x20 target. This nav
          appears from `md` (768px) upward, and 768 to 1024 is a tablet, which
          is a touch device, so a finger was being asked to hit 20px. The render
          audit could not see it while it only ran phone widths, where the nav
          is hidden.

          Width needed the same treatment: "FAQ" was a 27px-wide box. The
          padding is paid for out of the gap rather than added on top, so the
          rhythm is untouched. gap-7 is 28px between text edges; gap-2 plus
          px-2.5 is 8 + 10 + 10, also 28. The target grows, the design does
          not move.

          whitespace-nowrap because "How It Works" wrapped to two lines at
          768, which is what made it a 44px-wide target rather than a 90px one.

          Which exposed the real problem: with nothing wrapping, five links
          plus the logo plus Log In and Sign Up need more than 768px, and
          Sign Up was clipped 62px past the edge. The wrapping had been hiding
          an overfull header rather than solving it. So the full nav now starts
          at lg (1024) instead of md (768), and 768 to 1023 uses the same sheet
          the phone does. A tablet is a touch device, so the sheet is the
          honest affordance there anyway, and its links already carry 44px
          targets.

          The header row is a fixed h-14/sm:h-16/lg:h-20 flex row, so the 44px
          hit area sits inside it and centres; text size and baseline are
          unchanged.
        */}
        <nav className="hidden items-center gap-2 lg:flex" aria-label="Main navigation">
          {navLinks.map((link) =>
            link.href.startsWith("#") ? (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          {user ? (
            <>
              <Button asChild className="tap-target rounded-xl font-semibold shadow-md">
                <Link to={dashboardPath}>Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="tap-target text-muted-foreground">
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild className="tap-target font-semibold text-muted-foreground hover:text-primary">
                <Link to="/auth?mode=login">Log In</Link>
              </Button>
              <Button asChild className="tap-target rounded-xl font-semibold shadow-md hover:shadow-lg">
                <Link to="/auth">Sign Up</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu */}
        <div className="flex items-center gap-1.5 lg:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="tap-target">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                SafeDeal
              </SheetTitle>
              <nav className="mt-6 flex flex-col gap-1" aria-label="Mobile navigation">
                {navLinks.map((link) =>
                  link.href.startsWith("#") ? (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground min-h-11 inline-flex items-center"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      to={link.href}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground min-h-11 inline-flex items-center"
                    >
                      {link.label}
                    </Link>
                  )
                )}
              </nav>
              <div className="mt-6 flex flex-col gap-2">
                {user ? (
                  <>
                    <Button asChild onClick={() => setOpen(false)}>
                      <Link to={dashboardPath}>Dashboard</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setOpen(false); handleLogout(); }}
                      className="text-muted-foreground justify-start"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" asChild onClick={() => setOpen(false)}>
                      <Link to="/auth?mode=login">Log In</Link>
                    </Button>
                    <Button asChild onClick={() => setOpen(false)}>
                      <Link to="/auth">Sign Up</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
