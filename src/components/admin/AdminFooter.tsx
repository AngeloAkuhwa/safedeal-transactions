import { Link } from "react-router";

export function AdminFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-card px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <div>© {year} SafeDeal Admin Portal</div>
        {/* These are three discrete navigation targets, not links inline in a
            sentence, so WCAG 2.5.5's inline exemption does not cover them —
            they were 16px tall. Padding gives the row a 44px target without
            changing how it looks, and `-mx-2` keeps the left edge aligned
            with the copyright line above it. */}
        <nav className="-mx-2 flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          <Link to="/legal/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-foreground">Privacy Policy</Link>
          <Link to="/legal/terms" className="inline-flex min-h-11 items-center px-2 hover:text-foreground">Terms of Service</Link>
          <Link to="/admin/support" className="inline-flex min-h-11 items-center px-2 hover:text-foreground">Support</Link>
        </nav>
      </div>
    </footer>
  );
}