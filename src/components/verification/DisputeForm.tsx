import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { raiseDispute } from "@/services/verification.service";

const REASONS = [
  { value: "wrong_item_received", label: "Wrong item received" },
  { value: "damaged_item_received", label: "Damaged item received" },
  { value: "incomplete_order", label: "Incomplete order" },
  { value: "item_not_as_described", label: "Item not as described" },
  { value: "item_not_delivered", label: "Item not delivered" },
  { value: "suspected_fake_item", label: "Suspected fake item" },
  { value: "other", label: "Other" },
] as const;

interface DisputeFormProps {
  transactionId: string;
  onCancel: () => void;
}

export function DisputeForm({ transactionId, onCancel }: DisputeFormProps) {
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () => raiseDispute(transactionId, reason, description),
    onSuccess: (data) => {
      toast.success("Dispute submitted. Funds are now frozen.");
      navigate(data.redirect || "/dashboard/disputes");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit dispute");
    },
  });

  const canSubmit = reason && description.trim().length >= 20 && !mutation.isPending;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-2">
        <Label htmlFor="dispute-reason">Reason for dispute</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger id="dispute-reason">
            <SelectValue placeholder="Select a reason…" />
          </SelectTrigger>
          <SelectContent>
            {REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dispute-description">
          Describe the issue{" "}
          <span className="text-muted-foreground font-normal">(min 20 characters)</span>
        </Label>
        <Textarea
          id="dispute-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain what is wrong with the item you received…"
          rows={4}
        />
        <p className="text-xs text-muted-foreground text-right">
          {description.length} / 20 min
        </p>
      </div>

      <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Submitting a dispute will freeze escrow funds until our team reviews the case. The
          seller will have 48 hours to respond.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          onClick={() => mutation.mutate()}
          disabled={!canSubmit}
          className="flex-1"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit Dispute
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
