import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { confirmReceipt } from "@/services/verification.service";

interface ConfirmReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  transactionCode: string;
  amount: string;
}

export function ConfirmReceiptDialog({
  open,
  onOpenChange,
  transactionId,
  transactionCode,
  amount,
}: ConfirmReceiptDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => confirmReceipt(transactionId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["verification"] });
      if (data.already_confirmed) {
        toast.info("This transaction was already confirmed.");
      } else {
        toast.success("Item confirmed! Funds released to seller.");
      }
      navigate(data.redirect || "/dashboard/transactions");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to confirm receipt");
    },
  });

  const checks = [
    "The item I received matches the agreed description",
    "The quantity is correct",
    "There are no defects or damage",
    `I authorize the release of ${amount} to the seller`,
  ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Item Received</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to confirm receipt for{" "}
            <span className="font-semibold text-foreground">{transactionCode}</span>. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 my-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-success font-bold mt-0.5">✓</span>
              <span className="text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-xs text-destructive font-medium">
            ⚠️ Once confirmed, escrow funds will be released to the seller immediately. You
            will not be able to open a dispute after this action.
          </p>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button
            className="bg-success hover:bg-success/90 text-success-foreground"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Yes, Confirm Receipt
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
