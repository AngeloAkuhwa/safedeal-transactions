import { Eye, UserCheck, Headphones, Star } from "lucide-react";

const pillars = [
  {
    icon: Eye,
    title: "Complete Transparency",
    description: "Track every step of your transaction in real-time. Both parties see the same information at all times.",
    features: ["Real-time status updates", "Immutable transaction records", "Clear verification timelines"],
  },
  {
    icon: UserCheck,
    title: "Identity Verification",
    description: "All users are verified to ensure accountability and reduce fraud across the platform.",
    features: ["Email & phone verification", "Secure payment methods", "Transaction history tracking"],
  },
  {
    icon: Headphones,
    title: "Expert Support",
    description: "Our dedicated team is available 24/7 to help resolve issues and answer questions.",
    features: ["24/7 customer support", "Expert dispute resolution", "Fast response times"],
  },
];

const stats = [
  { value: "50K+", label: "Active Users" },
  { value: "98%", label: "Success Rate" },
  { value: "₦3.6B+", label: "Protected" },
  { value: "4.9/5", label: "User Rating" },
];

const testimonials = [
  {
    name: "Adaeze Nwosu",
    role: "Verified Buyer",
    text: "SafeDeal gave me complete peace of mind. The seller couldn't access the funds until I confirmed the laptop was exactly as described. Highly recommend!",
  },
  {
    name: "Emeka Obi",
    role: "Verified Seller",
    text: "As a seller, I love that buyers can't claim they didn't receive the item. The delivery proof system protects both parties perfectly.",
  },
  {
    name: "Funke Adeyemi",
    role: "Verified Buyer",
    text: "The dispute resolution process was fair and transparent. SafeDeal's team reviewed the evidence and made the right call. Trust this platform!",
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="bg-muted/50 py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Trust & Safety
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Every transaction on SafeDeal is protected by multiple layers of security and oversight.
          </p>
        </div>

        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1.5 font-semibold text-foreground">{p.title}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{p.description}</p>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Stats + Testimonials */}
        <div className="rounded-2xl bg-foreground p-6 sm:p-8 lg:p-10">
          <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-background sm:text-3xl">{s.value}</p>
                <p className="text-sm text-background/70">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-xl bg-background/10 p-5">
                <div className="mb-2 flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
                  ))}
                </div>
                <p className="mb-3 text-sm text-background/90">"{t.text}"</p>
                <div>
                  <p className="text-sm font-semibold text-background">{t.name}</p>
                  <p className="text-xs text-background/60">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
