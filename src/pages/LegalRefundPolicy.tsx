import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";

const TITLE = "Refund & Dispute Policy: SafeDeal";
const DESCRIPTION =
  "How SafeDeal escrow refunds work: when funds are returned, what is non-refundable, how to open a dispute, and the timelines for each stage.";

export default function LegalRefundPolicy() {
  usePageMeta({ title: TITLE, description: DESCRIPTION, path: "/legal/refund-policy" });

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground min-h-11"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SafeDeal
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Refund &amp; Dispute Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Placeholder policy: replace with your reviewed legal copy before launch. This text is a
          structural draft only and is not legal advice.
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. How escrow protection works</h2>
            <p className="mt-2">
              When a buyer pays for a protected transaction, the money is not sent to the seller. It
              is held by SafeDeal until the delivery and confirmation conditions agreed at checkout
              are met. Because the funds are held rather than forwarded, a refund does not depend on
              the seller agreeing to send money back.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. When a refund happens</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground">Before payment.</span> A transaction that is
                cancelled or declined before payment has no money attached, so there is nothing to
                refund.
              </li>
              <li>
                <span className="text-foreground">Seller does not deliver.</span> If the seller does
                not deliver within the agreed window, or the transaction times out awaiting
                dispatch, the held amount is returned to the buyer.
              </li>
              <li>
                <span className="text-foreground">Dispute resolved for the buyer.</span> Where a
                dispute outcome finds for the buyer, the held amount. In full or in the part the
                outcome specifies: is refunded.
              </li>
              <li>
                <span className="text-foreground">Item materially differs from the agreement.</span>{" "}
                Raised through the dispute process, with evidence, within the verification window.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. What is not refundable</h2>
            <p className="mt-2">
              The SafeDeal protection fee shown at checkout is non-refundable once payment has been
              collected, because the protection service has already been provided. Delivery fees
              arranged directly between buyer and seller are external to SafeDeal and are settled
              between those parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Once funds are released</h2>
            <p className="mt-2">
              After the buyer confirms receipt. Or after the auto-release window passes with no
              dispute: the held funds are released to the seller and the transaction is closed. A
              closed transaction can no longer be refunded through escrow; any remaining claim is a
              matter between the buyer and the seller.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Opening a dispute</h2>
            <p className="mt-2">
              Either party may open a dispute from the transaction screen while the funds are still
              held. You select a reason, describe what happened, and attach evidence such as photos,
              receipts, or delivery records. Opening a dispute freezes the funds so nothing is
              released while the case is open.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Timelines</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Buyer verification window after delivery is marked: as shown on the transaction.</li>
              <li>Auto-release of held funds if no dispute is raised: as shown on the transaction.</li>
              <li>Other party&apos;s response to a dispute: within the window shown in the case.</li>
              <li>SafeDeal review and outcome: after both sides have had the chance to respond.</li>
            </ul>
            <p className="mt-2">
              The exact windows are set per transaction and are always visible on the transaction
              itself, so both parties see the same countdown.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Outcomes</h2>
            <p className="mt-2">
              A dispute ends in release to the seller, refund to the buyer, or a split that the
              outcome states explicitly. Every outcome is recorded against the transaction with the
              reason, so both parties can see how the decision was reached.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Questions</h2>
            <p className="mt-2">
              For anything not covered here, see the{" "}
              <Link to="/contact" className="text-primary hover:underline">
                contact page
              </Link>
              . For a problem with a specific transaction, use the dispute flow on that transaction
              rather than email: it keeps the funds held while the case is reviewed.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}