import {
  LinkIcon,
  Clock,
  Camera,
  Timer,
  Bell,
  Scale,
  Lock,
  BarChart3,
  Smartphone,
} from "lucide-react";

const features = [
  { icon: LinkIcon, title: "Secure Transaction Links", description: "Share a protected link with your buyer. No account required for them to view and pay." },
  { icon: Clock, title: "Transaction Timeline", description: "Track every step from creation to completion with clear status updates." },
  { icon: Camera, title: "Evidence Upload", description: "Upload photos and videos for delivery proof or dispute evidence." },
  { icon: Timer, title: "Verification Countdown", description: "Clear countdown timer shows exactly when funds will be automatically released." },
  { icon: Bell, title: "Smart Notifications", description: "Get notified at every important step via email and in-app alerts." },
  { icon: Scale, title: "Fair Dispute System", description: "Expert team reviews evidence from both parties to ensure fair outcomes." },
  { icon: Lock, title: "Immutable Records", description: "Transaction details are locked after payment. No changes allowed." },
  { icon: BarChart3, title: "Dashboard Analytics", description: "Track your transactions, payments held, and completion rates." },
  { icon: Smartphone, title: "Mobile Optimized", description: "Manage transactions seamlessly on any device, anywhere." },
];

export function FeaturesGrid() {
  return (
    <section className="py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Powerful features for secure transactions
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Everything you need to buy and sell with complete confidence.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
