import { HelpCircle } from "lucide-react";
import { format } from "date-fns";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";

interface WhatHappensCardProps {
  deadlineAt: string | null;
}

export function WhatHappensCard({ deadlineAt }: WhatHappensCardProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg">
            <HelpCircle className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">
              What happens if I do nothing?
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                If you do not confirm receipt or raise a dispute before the verification
                window expires, the system will automatically release funds to the seller.
              </p>
              {deadlineAt && (
                <p className="font-medium text-foreground">
                  Auto-release date: {format(new Date(deadlineAt), "MMM dd, yyyy 'at' HH:mm")}
                </p>
              )}
              <p>
                If you believe there is an issue with your order, please raise a dispute
                before the deadline to protect your funds.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
