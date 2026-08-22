import { Link } from "react-router";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * Chrome for public pages that are not the landing page.
 *
 * `/marketplace` signed out rendered no header at all: no logo, no way back to
 * the site, and no way to sign up. A visitor arriving from a shared product
 * link was in a dead end: they could browse and then had nowhere to go, which
 * is the worst possible place to lose someone who is already interested.
 *
 * Deliberately not the landing `Header`: that one carries in-page anchors
 * (`#how-it-works`, `#protection`, `#faq`) which resolve to nothing anywhere
 * else, and this repo has already shipped one round of dead nav links. This
 * carries only destinations that exist.
 *
 * Deliberately small, per the icon-diet rule the landing rework established:
 * one mark, two links, one action. Sign Up is the single emphasised control —
 * everything else is quiet, so the one thing we want a visitor to do is the one
 * thing that looks clickable.
 */
export function PublicPageHeader({ current }: { current?: "marketplace" | "pricing" }) {
  return (
    <header className="safe-top sticky top-0 z-sticky w-full border-b border-border/80 bg-background/85 shadow-sm backdrop-blur-md">
      <div className="sd-page flex h-14 items-center justify-between gap-3 sm:h-16">
        <Link to="/" className="flex min-h-11 items-center gap-2.5" aria-label="SafeDeal home">
          <Shield className="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" aria-hidden />
          <span className="text-lg font-bold tracking-tight text-foreground sm:text-xl">SafeDeal</span>
        </Link>

        {/* Below sm the bar is logo + Sign up only: at 320px the full set needed
              358px of a 328px line and pushed the whole header off-screen. The
              two links live in the footer on every public page. */}
        <nav className="flex items-center gap-2 sm:gap-6" aria-label="Main navigation">
          {/* Classes are inline rather than behind a helper so the touch-target
              scanner can resolve them: a className it cannot read is a target
              it cannot verify, and it correctly refuses to assume. */}
          <Link
            to="/marketplace"
            aria-current={current === "marketplace" ? "page" : undefined}
            className={cn(
              "hidden min-h-11 min-w-11 items-center justify-center px-3 text-sm font-semibold transition-colors sm:inline-flex",
              current === "marketplace" ? "text-foreground" : "text-muted-foreground hover:text-primary",
            )}
          >
            Browse
          </Link>
          <Link
            to="/pricing"
            aria-current={current === "pricing" ? "page" : undefined}
            className={cn(
              "hidden min-h-11 min-w-11 items-center justify-center px-3 text-sm font-semibold transition-colors sm:inline-flex",
              current === "pricing" ? "text-foreground" : "text-muted-foreground hover:text-primary",
            )}
          >
            Pricing
          </Link>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <Button asChild size="sm" className="rounded-xl font-semibold shadow-sm">
            <Link to="/auth">Sign up</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
