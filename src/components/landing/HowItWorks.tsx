import { Store, Handshake, Shield, Lightbulb } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const marketplaceSteps = [
  { tone: "primary", title: "Browse products", desc: "Explore verified seller storefronts and protected listings" },
  { tone: "primary", title: "Review seller and product details", desc: "Check seller ratings, product specs, and delivery terms" },
  { tone: "warning", title: "Pay through SafeDeal", desc: "Money goes into a secure escrow account" },
  { tone: "primary", title: "Seller delivers", desc: "Item shipped with tracking and delivery proof" },
  { tone: "primary", title: "Buyer verifies item", desc: "Confirm the item matches what was ordered" },
  { tone: "success", title: "Funds are released", desc: "Seller receives payment immediately" },
];

const directSteps = [
  { tone: "success", title: "Seller creates protected transaction", desc: "Add item details, price, and delivery terms" },
  { tone: "success", title: "Buyer reviews agreement link", desc: "Check all details before paying" },
  { tone: "warning", title: "Buyer pays SafeDeal", desc: "Payment held securely in escrow" },
  { tone: "success", title: "Seller delivers", desc: "Ships item and uploads proof" },
  { tone: "success", title: "Buyer verifies", desc: "Confirms item matches agreement" },
  { tone: "success", title: "Funds are released", desc: "Seller receives payment" },
];

const numTone: Record<string, string> = {
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
};

function FlowCard({
  icon: Icon,
  title,
  steps,
  variant,
}: {
  icon: typeof Store;
  title: string;
  steps: { tone: string; title: string; desc: string }[];
  variant: "primary" | "success";
}) {
  const wrap =
    variant === "primary"
      ? "bg-gradient-to-br from-primary/5 via-card to-success/5 border-primary/20"
      : "bg-gradient-to-br from-success/5 via-card to-primary/5 border-success/20";
  const iconBg = variant === "primary" ? "bg-primary text-primary-foreground" : "bg-success text-success-foreground";
  return (
    <div className={`rounded-2xl border-2 p-4 sm:p-5 ${wrap}`}>
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <h3 className="text-base font-bold text-foreground sm:text-lg">{title}</h3>
      </div>
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <StepRow key={i} step={step} index={i} />
        ))}
      </ol>
    </div>
  );
}

function StepRow({ step, index }: { step: { tone: string; title: string; desc: string }; index: number }) {
  const ref = useScrollReveal<HTMLLIElement>();
  return (
    <li
      ref={ref}
      className="flex items-start gap-2.5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${numTone[step.tone]}`}
      >
        {index + 1}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{step.title}</p>
        <p className="text-xs leading-snug text-muted-foreground">{step.desc}</p>
      </div>
    </li>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-y bg-background">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Simple & Secure</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">
            How SafeDeal Works
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            A transparent escrow process that protects both buyers and sellers throughout the transaction.
          </p>
        </div>

        <Tabs defaultValue="marketplace" className="w-full">
          <TabsList className="mx-auto mb-5 flex h-auto w-full max-w-xl flex-col gap-1 rounded-2xl bg-muted/60 p-1.5 sm:flex-row">
            <TabsTrigger value="marketplace" className="tap-target w-full gap-2 rounded-xl py-2 text-[13px] font-semibold">
              <Store className="h-4 w-4" />
              Buying from Marketplace
            </TabsTrigger>
            <TabsTrigger value="direct" className="tap-target w-full gap-2 rounded-xl py-2 text-[13px] font-semibold">
              <Handshake className="h-4 w-4" />
              Direct Transaction
            </TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              <FlowCard
                icon={Store}
                title="Marketplace Buyer Flow"
                steps={marketplaceSteps}
                variant="primary"
              />
              <FlowCard
                icon={Shield}
                title="What we protect"
                steps={[
                  { tone: "primary", title: "Identity-verified sellers", desc: "Email, phone, and document checks" },
                  { tone: "primary", title: "Locked agreements", desc: "Terms cannot change after payment" },
                  { tone: "warning", title: "Funds held in escrow", desc: "No early release to the seller" },
                  { tone: "primary", title: "Verification window", desc: "Time to inspect what you received" },
                  { tone: "primary", title: "Evidence-based disputes", desc: "Photo and video proof from both sides" },
                  { tone: "success", title: "Fair outcomes", desc: "Reviewed by SafeDeal's team" },
                ]}
                variant="success"
              />
            </div>
          </TabsContent>

          <TabsContent value="direct" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              <FlowCard
                icon={Handshake}
                title="Direct Transaction Flow"
                steps={directSteps}
                variant="success"
              />
              <FlowCard
                icon={Shield}
                title="Why use a protected link"
                steps={[
                  { tone: "primary", title: "Share via WhatsApp, Instagram, DMs", desc: "Anywhere you talk to your buyer" },
                  { tone: "primary", title: "Buyer reviews terms first", desc: "No surprises, no pressure" },
                  { tone: "warning", title: "Escrow holds the money", desc: "Until buyer confirms delivery" },
                  { tone: "primary", title: "Auto-release window", desc: "Funds release if no dispute is raised" },
                  { tone: "primary", title: "Immutable record", desc: "Both parties have proof of the deal" },
                  { tone: "success", title: "Get paid safely", desc: "Without third-party marketplace fees" },
                ]}
                variant="primary"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mx-auto mt-5 max-w-3xl rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 sm:mt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Shield className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h4 className="mb-1 text-sm font-bold text-foreground sm:text-base">
                SafeDeal holds the money until buyer verification is complete
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                Your payment stays in our secure escrow account. Funds are only released after you
                confirm the item matches, or after the verification window expires without a dispute.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
