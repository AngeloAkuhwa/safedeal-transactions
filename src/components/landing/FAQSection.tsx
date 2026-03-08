import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How does SafeDeal protect my payment?",
    a: "SafeDeal holds your payment in a secure escrow account. Funds are only released to the seller after you confirm the item matches what was agreed, or after the verification window expires without a dispute.",
  },
  {
    q: "What happens if the item doesn't match?",
    a: "You can raise a dispute within the verification window. Upload photos and videos as evidence, and our expert team will review both sides to make a fair decision.",
  },
  {
    q: "How long is the verification window?",
    a: "The default verification window is 72 hours after delivery confirmation. Sellers can customize this when creating the transaction. If no action is taken, funds are automatically released to the seller.",
  },
  {
    q: "What fees does SafeDeal charge?",
    a: "SafeDeal charges a 2.5% platform fee plus 1.5% payment processing fee. There are no setup fees, monthly fees, or hidden charges.",
  },
  {
    q: "Can the transaction details be changed after payment?",
    a: "No. Once payment is made, the transaction agreement is locked and immutable. This protects both parties from unauthorized changes to the terms.",
  },
  {
    q: "Do buyers need a SafeDeal account?",
    a: "No. Buyers can review and pay for transactions using just the secure link provided by the seller. Creating an account is optional but provides additional features like transaction history and notifications.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="py-14 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground">
            Everything you need to know about SafeDeal.
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
