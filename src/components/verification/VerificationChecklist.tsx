import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VerificationChecklistProps {
  item: {
    title: string;
    description: string;
    quantity: number;
    condition_label: string;
  } | null;
}

export function VerificationChecklist({ item }: VerificationChecklistProps) {
  const checks = [
    {
      title: "Item Description Matches",
      detail: item ? `${item.title} — ${item.description}` : "N/A",
    },
    {
      title: "Correct Quantity Received",
      detail: item ? `Qty: ${item.quantity}` : "N/A",
      badge: item ? String(item.quantity) : undefined,
    },
    {
      title: "Condition as Described",
      detail: item?.condition_label
        ? item.condition_label.replace(/_/g, " ")
        : "N/A",
      badge: item?.condition_label?.replace(/_/g, " "),
    },
    { title: "No Damage or Defects", detail: "Inspect item thoroughly for any physical damage" },
    { title: "Functionality Check", detail: "Test item functions as expected per agreement" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Verification Checklist</CardTitle>
        <p className="text-xs text-muted-foreground">
          Review these points before confirming receipt
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {checks.map((c, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                {c.badge && (
                  <Badge variant="secondary" className="text-[10px]">
                    {c.badge}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
