import { Shield, Lock, Headphones, CheckCircle } from "lucide-react";

const items = [
  { icon: Shield, label: "Bank-Level Security" },
  { icon: Lock, label: "100% Payment Protection" },
  { icon: Headphones, label: "24/7 Dispute Support" },
  { icon: CheckCircle, label: "Instant Transaction Setup" },
];

export function TrustBanner() {
  return (
    <section className="bg-primary py-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-8 px-4 sm:gap-12 lg:gap-16">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-primary-foreground">
            <item.icon className="h-5 w-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
