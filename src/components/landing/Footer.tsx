import { Shield, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-foreground py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-background">SafeDeal</span>
            </div>
            <p className="text-sm text-background/60">
              Protecting buyers and sellers in online transactions with secure escrow payments and transparent verification.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-background/50">
              <MapPin className="h-3.5 w-3.5" />
              Currently available in Lagos, Nigeria — expanding soon
            </div>
          </div>

          {/* How It Works */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-background">How It Works</h4>
            <ul className="space-y-2">
              {["Create Transaction", "Secure Payment", "Track Delivery", "Verify & Release"].map((item) => (
                <li key={item}>
                  <a href="#how-it-works" className="text-sm text-background/60 transition-colors hover:text-background/90">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-background">Company</h4>
            <ul className="space-y-2">
              {["About Us", "Careers", "Blog", "Press Kit"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-background/60 transition-colors hover:text-background/90">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-background">Support</h4>
            <ul className="space-y-2">
              {["Help Center", "Contact Us", "Terms of Service", "Privacy Policy"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-background/60 transition-colors hover:text-background/90">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-background/10 pt-6 text-center">
          <p className="text-xs text-background/50">
            © {new Date().getFullYear()} SafeDeal. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
