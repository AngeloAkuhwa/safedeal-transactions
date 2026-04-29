import {
  Activity,
  BadgeCheck,
  Lock,
  Camera,
  Gavel,
  Wallet,
  CircleCheck,
  Link2,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning" | "danger";

interface Card {
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: Tone;
}

const CARDS: Card[] = [
  { icon: Activity, title: "Transaction timeline", desc: "Every step tracked end-to-end.", tone: "primary" },
  { icon: BadgeCheck, title: "Verified sellers", desc: "Email, phone, and ID checked.", tone: "success" },
  { icon: Lock, title: "Locked agreement", desc: "Terms can't change after payment.", tone: "warning" },
  { icon: Camera, title: "Delivery evidence", desc: "Photos and proof on file.", tone: "primary" },
  { icon: Gavel, title: "Evidence-backed disputes", desc: "Reviewed by SafeDeal's team.", tone: "danger" },
  { icon: Wallet, title: "Clear money status", desc: "Always know where funds sit.", tone: "warning" },
  { icon: CircleCheck, title: "Buyer confirmation", desc: "Funds release only after approval.", tone: "success" },
  { icon: Link2, title: "Direct deal links", desc: "Share via WhatsApp or DMs.", tone: "primary" },
  { icon: LifeBuoy, title: "Support", desc: "Help when you need it.", tone: "success" },
];

const toneMap: Record<Tone, { wrap: string; icon: string; hover: string }> = {
  primary: {
    wrap: "bg-primary/10",
    icon: "text-primary",
    hover: "group-hover:bg-primary group-hover:text-primary-foreground",
  },
  success: {
    wrap: "bg-success/10",
    icon: "text-success",
    hover: "group-hover:bg-success group-hover:text-success-foreground",
  },
  warning: {
    wrap: "bg-warning/10",
    icon: "text-warning",
    hover: "group-hover:bg-warning group-hover:text-warning-foreground",
  },
  danger: {
    wrap: "bg-destructive/10",
    icon: "text-destructive",
    hover: "group-hover:bg-destructive group-hover:text-destructive-foreground",
  },
};

function CardTile({ c, index }: { c: Card; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[c.tone];
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 50}ms` }}
      className="group flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg sm:p-4"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110 ${t.wrap} ${t.hover}`}
      >
        <c.icon className={`h-5 w-5 transition-colors ${t.icon} group-hover:text-current`} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold leading-tight text-foreground sm:text-[15px]">
          {c.title}
        </h3>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{c.desc}</p>
      </div>
    </div>
  );
}

export function TransparencyTrustSection() {
  return (
    <section id="transparency" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <h2 className="h-section mb-2 font-bold text-foreground">
            What protects every deal
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Nine guarantees. Built into every transaction.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {CARDS.map((c, i) => (
            <CardTile key={c.title} c={c} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
