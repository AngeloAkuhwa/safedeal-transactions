import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Flag, X, CloudUpload, Plus } from "lucide-react";
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
    <div className="bg-card rounded-2xl shadow-lg border-2 border-destructive/30 p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-bold text-foreground">Submit a Dispute</h2>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="space-y-6">
        {/* Reason */}
        <div className="space-y-2">
          <Label htmlFor="dispute-reason" className="text-sm font-semibold">
            Reason for Dispute
          </Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="dispute-reason" className="rounded-xl">
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

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="dispute-description" className="text-sm font-semibold">
            Describe the Issue{" "}
            <span className="text-muted-foreground font-normal">(min 20 characters)</span>
          </Label>
          <Textarea
            id="dispute-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain in detail what is wrong with the item you received…"
            rows={4}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length} / 20 min
          </p>
        </div>

        {/* Upload zone (visual placeholder) */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Upload Evidence</Label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
            <CloudUpload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">
              Click to upload photos or videos
            </p>
            <p className="text-xs text-muted-foreground mb-4">or drag and drop files here</p>
            <p className="text-xs text-muted-foreground/60">PNG, JPG, MP4 up to 10MB each</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="aspect-square bg-muted/50 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
              <Plus className="h-6 w-6 text-muted-foreground/40" />
            </div>
          </div>
        </div>

        {/* Review warning */}
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Review Before Submitting</p>
              <p className="text-xs text-muted-foreground">
                Make sure all information is accurate and you've uploaded clear evidence. Once
                submitted, you cannot edit your dispute.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 font-bold py-4 rounded-xl shadow-lg"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Dispute
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={mutation.isPending}
            className="flex-1 font-semibold py-4 rounded-xl border-2"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
