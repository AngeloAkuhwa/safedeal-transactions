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
    a: "SafeDeal holds your payment in a secure escrow account. Funds are only released to the seller after you confirm the item matches what was agreed, or after the verification window expires without a dispute.",
  },
  {
    q: "Can I browse products without signing up?",
    a: "Yes! You can browse the SafeDeal marketplace, view products, and explore seller storefronts publicly. You only need to sign up when you're ready to make a purchase.",
  },
  {
    q: "When does the seller receive money?",
    a: "Sellers receive payment only after you confirm the item matches the agreement or the verification window expires without dispute. Your funds are held securely in SafeDeal escrow until then.",
  },
  {
    q: "What happens if the item doesn't match?",
    a: "You can raise a dispute with photo and video evidence. SafeDeal reviews both buyer and seller evidence fairly. Funds remain held in escrow until the dispute is resolved.",
  },
  {
    q: "Can sellers create direct transaction links?",
    a: "Yes! Sellers can create protected transaction links for specific buyers. This is perfect for deals that start on WhatsApp, Instagram, or other platforms outside the marketplace.",
  },
  {
    q: "Are payments outside SafeDeal protected?",
    a: "No. Only payments made through SafeDeal are protected by escrow. Never pay sellers directly outside the platform. SafeDeal cannot protect or recover payments made outside the system.",
  },
  {
    q: "What cities does SafeDeal support?",
    a: "SafeDeal is currently available in Lagos, Nigeria. We're expanding to other Nigerian cities soon. All payments are in NGN.",
  },
  {
    q: "What documents do sellers need for verification?",
    a: "Sellers need to verify email, phone number, and identity. This helps buyers trust that they're dealing with real, verified sellers on SafeDeal.",
  },
];

function FaqItem({ faq, index }: { faq: { q: string; a: string }; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-2 transition-all hover:border-primary/30 hover:shadow-lg"
    >
      <AccordionItem value={`faq-${index}`} className="border-none">
        <AccordionTrigger className="px-4 py-4 text-left text-base font-bold text-foreground hover:no-underline sm:px-5 sm:text-lg">
          <span className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HelpCircle className="h-4 w-4" />
            </span>
            <span className="flex-1">{faq.q}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4 pl-[60px] text-sm leading-relaxed text-muted-foreground sm:px-5 sm:pb-5 sm:pl-[68px] sm:text-base">
          {faq.a}
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}

export function FAQSection() {
  const half = Math.ceil(faqs.length / 2);
  const left = faqs.slice(0, half);
  const right = faqs.slice(half);
  return (
    <section id="faq" className="section-y bg-background">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-10 text-center sm:mb-14">
          <h2 className="h-section mb-3 font-bold text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-muted-foreground">
            Everything you need to know about SafeDeal marketplace and protected transactions.
          </p>
        </div>
        <Accordion type="single" collapsible className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          {left.map((faq, i) => (
            <FaqItem key={i} faq={faq} index={i} />
          ))}
          {right.map((faq, i) => (
            <FaqItem key={i + half} faq={faq} index={i + half} />
          ))}
        </Accordion>
      </div>
    </section>
  );
}
