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
      className={`group rounded-2xl border bg-card p-4 sm:p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl ${
        full ? "lg:col-span-2" : ""
      }`}
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${wrap}`}>
        <Icon className={`h-[18px] w-[18px] ${color}`} />
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">{title}</h3>
      <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
      <div className="flex items-center justify-between border-t pt-2.5">
        <span className="text-xs font-semibold text-muted-foreground">{note}</span>
        <RightIcon className={`h-3.5 w-3.5 ${color}`} />
      </div>
    </div>
  );
}

export function NeedHelpSection() {
  return (
    <section id="support" className="section-y bg-background">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <h2 className="h-section mb-2 font-bold text-foreground">
            Need help?
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            We're here to assist with any questions about marketplace, transactions, or protection.
          </p>
        </div>

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <HelpCard
            icon={HelpCircle}
            title="Frequently Asked Questions"
            desc="Find answers to common questions about SafeDeal marketplace, transactions, and protection."
            note="Common questions"
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
