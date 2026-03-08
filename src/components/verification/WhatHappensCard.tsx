import { HelpCircle, Clock, AlertTriangle, Headphones } from "lucide-react";

interface WhatHappensCardProps {
  deadlineAt: string | null;
}

export function WhatHappensCard({ deadlineAt }: WhatHappensCardProps) {
  return (
    <div className="bg-card rounded-2xl shadow-lg border border-border p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-4">
        <HelpCircle className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">What happens if I do nothing?</h2>
      </div>

      <div className="space-y-4">
        {/* Auto-release info */}
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="h-4 w-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Funds will auto-release when timer expires
            </h3>
            <p className="text-sm text-muted-foreground">
              If you take no action within the 72-hour verification window, the funds will
              automatically be released to the seller. This protects both parties and ensures
              transactions are completed in a timely manner.
            </p>
          </div>
        </div>

        {/* Dispute deadline warning */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground mb-1">
              Dispute must be opened before expiry
            </h3>
            <p className="text-sm text-muted-foreground">
              Once the verification window closes, you will no longer be able to raise a dispute.
              Make sure to review the item carefully and take action before the countdown reaches zero.
            </p>
          </div>
        </div>

        {/* Support CTA */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mt-4">
          <div className="flex items-start gap-3">
            <Headphones className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Need assistance?</p>
              <p className="text-xs text-muted-foreground">
                Contact support if there is a delivery verification issue or if you have questions
                about the verification process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
