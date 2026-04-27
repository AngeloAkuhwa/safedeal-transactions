import { HelpCircle, Headphones, Mail, BookOpen, MessagesSquare } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

function HelpCard({
  icon: Icon,
  title,
  desc,
  note,
  rightIcon: RightIcon,
  tone,
  full = false,
}: {
  icon: typeof HelpCircle;
  title: string;
  desc: string;
  note: string;
  rightIcon: typeof BookOpen;
  tone: "primary" | "success" | "warning";
  full?: boolean;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const wrap =
    tone === "primary" ? "bg-primary/10" : tone === "success" ? "bg-success/10" : "bg-warning/10";
  const color =
    tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : "text-warning";
  return (
    <div
      ref={ref}
      className={`group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl sm:p-8 ${
        full ? "lg:col-span-2" : ""
      }`}
    >
      <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${wrap}`}>
        <Icon className={`h-7 w-7 ${color}`} />
      </div>
      <h3 className="mb-2 text-xl font-bold text-foreground">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground sm:text-base">{desc}</p>
      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-sm font-semibold text-muted-foreground">{note}</span>
        <RightIcon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
  );
}

export function NeedHelpSection() {
  return (
    <section id="support" className="bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Need help?
          </h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            We're here to assist with any questions about marketplace, transactions, or protection.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <HelpCard
            icon={HelpCircle}
            title="Frequently Asked Questions"
            desc="Find answers to common questions about SafeDeal marketplace, transactions, and protection."
            note="100+ questions"
            rightIcon={BookOpen}
            tone="primary"
          />
          <HelpCard
            icon={Headphones}
            title="Live Chat Support"
            desc="Talk to our support team in real-time for immediate assistance with your transactions."
            note="Live support"
            rightIcon={MessagesSquare}
            tone="success"
          />
          <HelpCard
            icon={Mail}
            title="Email Support"
            desc="Send us an email with your question or issue. We'll respond within 24 hours."
            note="support@safedeal.app"
            rightIcon={Mail}
            tone="warning"
            full
          />
        </div>
      </div>
    </section>
  );
}
