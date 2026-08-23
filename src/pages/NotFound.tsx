import { Link, useLocation } from "react-router";
import { useEffect } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The page nothing links to on purpose.
 *
 * Until the audit it was a bare 404 with a raw `<a href="/">`: a full page
 * reload out of the SPA, no branding, and exactly one exit. It also turned
 * out to be the landing page of a real defect, because the payment screen's
 * escape hatch pointed at a route that never existed. A dead end is where a
 * lost user is most in need of the chrome the rest of the app provides, so
 * this offers the two exits that are always safe (home and the marketplace)
 * through the router rather than around it.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <Shield className="mx-auto mb-6 h-10 w-10 text-primary" aria-hidden />
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">This page does not exist</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The link may be out of date, or the address may have been typed by hand.
          Nothing has been lost: your account, transactions and orders are unaffected.
        </p>
        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button asChild className="min-h-11">
            <Link to="/">Go to the homepage</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/marketplace">Browse the marketplace</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
