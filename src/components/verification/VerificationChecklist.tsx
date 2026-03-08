import { CheckCircle2, ClipboardCheck, Info } from "lucide-react";
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
      subtitle: "Verify that the item title and description match what was agreed:",
      dataCard: item ? (
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm font-semibold text-foreground mb-1">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </div>
      ) : null,
    },
    {
      title: "Correct Quantity",
      subtitle: "Confirm you received the correct quantity:",
      dataCard: item ? (
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Quantity:</span>
            <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              {item.quantity} Unit{item.quantity > 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      ) : null,
    },
    {
      title: "Condition as Described",
      subtitle: "Check that the item condition matches what was agreed:",
      dataCard: item?.condition_label ? (
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Agreed Condition:</span>
            <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
              {item.condition_label.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
      ) : null,
    },
    {
      title: "No Damage or Defects",
      subtitle: "Inspect the item for any damage, defects, or missing components that were not disclosed in the agreement.",
    },
    {
      title: "Functionality Check",
      subtitle: "Test the item to ensure it works as expected and all features are functional.",
    },
  ];

  return (
    <div className="bg-card rounded-2xl shadow-lg border border-border p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Verification Checklist</h2>
      </div>

      {/* Responsibility banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-5">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Your Responsibility</p>
            <p className="text-xs text-muted-foreground">
              Please carefully verify that the item received matches the agreement before confirming.
              If there are any issues, raise a dispute immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-4">
        {checks.map((c, i) => (
          <div key={i} className="bg-muted/50 rounded-xl p-5 border border-border">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center shrink-0 mt-1">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{c.subtitle}</p>
                {c.dataCard}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
