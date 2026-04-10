import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { submitSellerResponse } from "@/services/seller-dispute-detail.service";

interface SellerResponseFormProps {
  disputeId: string;
  onSuccess: () => void;
}

export function SellerResponseForm({ disputeId, onSuccess }: SellerResponseFormProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (text.trim().length < 10) {
      toast.error("Your response must be at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await submitSellerResponse(disputeId, text.trim());
      toast.success("Response submitted successfully.");
      onSuccess();
    } catch (err) {
      toast.error((err as Error).message || "Failed to submit response.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-primary/5 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Submit Your Response</h3>
            <p className="text-sm text-muted-foreground">
              Explain your side clearly. Include relevant details about the transaction.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <Textarea
          placeholder="Describe your response to the buyer's claim. Include any relevant details about the item, delivery, or communication..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={5000}
          className="resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {text.length}/5000 characters
          </p>
          <Button onClick={handleSubmit} disabled={submitting || text.trim().length < 10}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit Response
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
