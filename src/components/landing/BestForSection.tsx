import { MessageCircle, Instagram, Globe } from "lucide-react";

const channels = [
  {
    icon: MessageCircle,
    name: "WhatsApp",
    tagline: "Deals started on WhatsApp",
    description: "Found a seller on WhatsApp? Protect your payment with SafeDeal before sending money.",
  },
  {
    icon: Instagram,
    name: "Instagram",
    tagline: "Instagram sellers and buyers",
    description: "Buying from or selling to Instagram users? Add protection to every transaction.",
  },
  {
    icon: Globe,
    name: "Direct Online",
    tagline: "Direct online transactions",
    description: "Any deal happening outside traditional marketplaces deserves payment protection.",
  },
];

export function BestForSection() {
  return (
    <section className="py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Perfect For
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            SafeDeal works where traditional platforms don't — protecting deals that happen outside marketplaces
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {channels.map((ch) => (
            <div
              key={ch.name}
              className="rounded-xl border bg-card p-6 text-center shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ch.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-1 text-base font-semibold text-foreground">{ch.tagline}</h3>
              <p className="text-sm text-muted-foreground">{ch.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border bg-muted/50 p-6">
          <h3 className="mb-2 font-semibold text-foreground">How it works for social sellers</h3>
          <p className="text-sm text-muted-foreground">
            Create a protected transaction on SafeDeal, share the secure link with your buyer via DM or chat, and get paid safely. Your buyer reviews the terms and pays through SafeDeal — funds are held until they confirm delivery.
          </p>
        </div>
      </div>
    </section>
  );
}
