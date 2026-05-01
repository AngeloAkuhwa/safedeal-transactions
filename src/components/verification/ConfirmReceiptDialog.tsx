import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
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
        toast.success("Receipt confirmed. SafeDeal will review and release funds after the seller confirms.");
      }
      navigate(data.redirect || "/dashboard/transactions");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to confirm receipt");
    },
  });

  const checks = [
    "The item matches the agreement description",
    "The quantity and condition are correct",
    "There are no defects or damage",
  ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg rounded-3xl p-6">
        {/* Large success icon */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1.5">Confirm Item Receipt?</h2>
          <p className="text-sm text-muted-foreground">This action cannot be undone</p>
        </div>

        {/* Checklist */}
        <div className="bg-muted/50 rounded-xl p-5 mb-6 border border-border">
          <p className="text-sm text-muted-foreground mb-4">By confirming, you are declaring that:</p>
          <ul className="space-y-2 text-sm text-foreground">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Danger warning */}
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-destructive font-semibold mb-1">
                Once you confirm, you cannot raise a dispute on this transaction
              </p>
              <p className="text-xs text-destructive/80 font-semibold">
                Your seller will then confirm, and SafeDeal will review and process the release.
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Button
            className="flex-1 bg-success hover:bg-success/90 text-success-foreground font-bold py-4 rounded-xl shadow-lg"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Yes, Confirm Receipt
          </Button>
          <AlertDialogCancel
            disabled={mutation.isPending}
            className="flex-1 font-semibold py-4 rounded-xl border-2"
          >
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
