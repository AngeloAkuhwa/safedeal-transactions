import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const faqs = [
  {
    q: "How does SafeDeal protect my payment?",
    a: "Your payment sits in escrow until you confirm the item matches — or the verification window closes without a dispute.",
  },
  {
    q: "Can I browse without signing up?",
    a: "Yes. Browsing is public. You only sign in when you're ready to buy.",
  },
  {
    q: "When does the seller get paid?",
    a: "After you confirm the item, or once the verification window expires with no dispute.",
  },
  {
    q: "What if the item doesn't match?",
    a: "Raise a dispute with photos or video. SafeDeal reviews evidence from both sides before releasing funds.",
  },
  {
    q: "Can sellers create direct links?",
    a: "Yes. Share a protected link for deals from WhatsApp, Instagram, or DMs.",
  },
  {
    q: "Are payments outside SafeDeal protected?",
    a: "No. Only payments made through SafeDeal are protected. Never pay sellers directly.",
  },
  {
    q: "Which cities do you support?",
    a: "Lagos, Nigeria first — more cities coming. Payments in NGN.",
  },
  {
    q: "What do sellers verify?",
    a: "Email, phone, and identity — so buyers know they're real.",
  },
];

function FaqItem({ faq, index }: { faq: { q: string; a: string }; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 40}ms` }}
      className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-md"
    >
      <AccordionItem value={`faq-${index}`} className="border-none">
        <AccordionTrigger className="group px-3.5 py-3 text-left text-[13px] font-semibold text-foreground hover:no-underline sm:text-[14px]">
          <span className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">{faq.q}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-3.5 pb-3 pl-[52px] text-[13px] leading-relaxed text-muted-foreground">
          {faq.a}
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="section-y bg-background">
      <div className="container-x mx-auto max-w-4xl">
        <div className="mb-5 text-center sm:mb-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">FAQ</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">Frequently asked questions</h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Quick answers. Tap to open.
          </p>
        </div>
        <Accordion type="single" collapsible className="grid gap-2">
          {faqs.map((faq, i) => (
            <FaqItem key={i} faq={faq} index={i} />
          ))}
        </Accordion>
      </div>
    </section>
  );
}
