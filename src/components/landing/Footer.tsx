import { Link } from "react-router-dom";
import { Shield, MapPin, Twitter, Facebook, Linkedin, Instagram } from "lucide-react";

const productLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Protection", href: "#protection" },
  { label: "Trust & Safety", href: "#trust" },
];

const companyLinks = ["About Us", "Careers", "Blog", "Press Kit"];
const supportLinks = ["Help Center", "Contact Us", "Terms of Service", "Privacy Policy"];
const socials = [
  { icon: Twitter, label: "Twitter" },
  { icon: Facebook, label: "Facebook" },
  { icon: Linkedin, label: "LinkedIn" },
  { icon: Instagram, label: "Instagram" },
];

export function Footer() {
  return (
    <footer className="safe-bottom border-t bg-foreground pb-5 pt-8 text-background sm:pt-10">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Shield className="h-[18px] w-[18px] text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-background">SafeDeal</span>
            </div>
            <p className="mb-4 max-w-sm text-[13px] text-background/60">
              Protecting buyers and sellers in online transactions with secure escrow payments and
              transparent verification.
            </p>
            <div className="mb-4 inline-flex items-center gap-1.5 text-xs text-background/50">
              <MapPin className="h-3.5 w-3.5" />
              Currently available in Lagos, Nigeria — expanding soon
            </div>
            <div className="flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/10 text-background/80 transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-3 text-[13px] font-semibold text-background">Product</h4>
            <ul className="space-y-2">
              {productLinks.map((item) =>
                item.href.startsWith("#") ? (
                  <li key={item.label}>
                    <a href={item.href} className="text-[13px] text-background/60 transition-colors hover:text-background">
                      {item.label}
                    </a>
                  </li>
                ) : (
                  <li key={item.label}>
                    <Link to={item.href} className="text-[13px] text-background/60 transition-colors hover:text-background">
                      {item.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="mb-3 text-[13px] font-semibold text-background">Company</h4>
            <ul className="space-y-2">
              {companyLinks.map((item) => (
                <li key={item}>
                  <a href="#" className="text-[13px] text-background/60 transition-colors hover:text-background">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-3 text-[13px] font-semibold text-background">Support</h4>
            <ul className="space-y-2">
              {supportLinks.map((item) => (
                <li key={item}>
                  <a href="#" className="text-[13px] text-background/60 transition-colors hover:text-background">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-background/10 pt-5">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-background/50">
              © {new Date().getFullYear()} SafeDeal. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-xs text-background/50">
              <a href="#" className="hover:text-background">Terms</a>
              <a href="#" className="hover:text-background">Privacy</a>
              <a href="#" className="hover:text-background">Cookies</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
