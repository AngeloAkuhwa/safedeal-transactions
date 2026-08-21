import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const faqs = [
  {
    q: "How does SafeDeal protect my payment?",
    a: "Your payment sits in escrow until you confirm the item matches. Or the verification window closes without a dispute.",
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
    a: "Yes. Share a protected link for deals that start anywhere. Social apps, marketplaces, email, or your own website.",
  },
  {
    q: "Are payments outside SafeDeal protected?",
    a: "No. Only payments made through SafeDeal are protected. Never pay sellers directly.",
  },
  {
    q: "Where is SafeDeal available?",
    a: "SafeDeal is live in Lagos, Nigeria today, with more cities and countries rolling out. Payments currently settle in Nigerian Naira (₦). Join the waitlist if you're outside a live region and we'll notify you.",
  },
  {
    q: "What do sellers verify?",
    a: "Email, phone, and identity: so buyers know they're real.",
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
        <AccordionTrigger className="group px-3.5 py-3 text-left text-sm font-semibold text-foreground hover:no-underline sm:text-base">
          <span className="flex-1">{faq.q}</span>
        </AccordionTrigger>
        <AccordionContent className="px-3.5 pb-3 text-left text-sm leading-relaxed text-muted-foreground">
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
          <h2 className="h-section mb-2 font-bold text-foreground">Frequently asked questions</h2>
          <p className="body-lead mx-auto max-w-xl text-left text-muted-foreground sm:text-center">
            Tap to expand.
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
