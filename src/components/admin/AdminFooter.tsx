import { Link } from "react-router-dom";

export function AdminFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-card px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <div>© {year} SafeDeal Admin Portal</div>
        <nav className="flex items-center gap-4">
          <Link to="/legal/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/legal/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/admin/support" className="hover:text-foreground">Support</Link>
        </nav>
      </div>
    </footer>
  );
}