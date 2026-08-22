import { Link } from "react-router";
import { Shield, MapPin } from "lucide-react";

const productLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Protection", href: "#protection" },
  { label: "Pricing", href: "/pricing" },
];

const supportLinks: { label: string; href: string }[] = [
  { label: "Contact Us", href: "/contact" },
  { label: "Refund & Dispute Policy", href: "/legal/refund-policy" },
];

export function Footer() {
  return (
    <footer className="safe-bottom border-t bg-card pb-5 pt-7 text-foreground sm:pt-9">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-[18px] w-[18px] text-primary-foreground" />
              <span className="text-lg font-bold text-foreground">SafeDeal</span>
            </div>
            <p className="mb-4 max-w-sm text-[13px] text-muted-foreground">
              Protecting buyers and sellers in online transactions with secure escrow payments and
              transparent verification.
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Live in Lagos 🇳🇬: more cities rolling out
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-3 text-[13px] font-semibold text-foreground">Product</h4>
            <ul className="space-y-2">
              {productLinks.map((item) =>
                item.href.startsWith("#") ? (
                  <li key={item.label}>
                    <a href={item.href} className="inline-flex min-h-11 min-w-11 items-center text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                      {item.label}
                    </a>
                  </li>
                ) : (
                  <li key={item.label}>
                    <Link to={item.href} className="inline-flex min-h-11 min-w-11 items-center text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                      {item.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-3 text-[13px] font-semibold text-foreground">Support</h4>
            <ul className="space-y-2">
              {supportLinks.map((item) => (
                <li key={item.label}>
                  <Link to={item.href} className="inline-flex min-h-11 min-w-11 items-center text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t pt-5">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} SafeDeal. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <Link to="/legal/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 hover:text-foreground">Terms</Link>
              <Link to="/legal/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 hover:text-foreground">Privacy</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
