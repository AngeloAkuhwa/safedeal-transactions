import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import type { DisputeOutcomeType } from "@/services/admin-transaction-actions.service";
import { formatMoney } from "@/lib/format";

type Mode = DisputeOutcomeType | "request_more_information";

const FINAL_OUTCOMES: { value: DisputeOutcomeType; label: string; tone: "buyer" | "seller" | "split" | "neutral"; help: string }[] = [
  { value: "refund_buyer", label: "Refund buyer", tone: "buyer", help: "Full refund. Funds move to Refund Pending; refund worker handles payout." },
  { value: "release_funds_to_seller", label: "Release funds to seller", tone: "seller", help: "Funds become eligible for release review. Central admin release workflow performs the payout." },
  { value: "partial_refund_release", label: "Partial refund + release", tone: "split", help: "Split decision. Refund processes first, then release portion is queued for admin release." },
  { value: "dismissed_seller_favor", label: "Dismiss (seller favor)", tone: "seller", help: "Dispute dismissed. Funds queued for release review." },
  { value: "dismissed_buyer_favor", label: "Dismiss (buyer favor)", tone: "buyer", help: "Dispute dismissed in buyer's favor. Refund initiated." },
  { value: "close_case_without_resolution", label: "Close case (no action)", tone: "neutral", help: "No money movement. Transaction continues on its current state." },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moneyStatus: string | null | undefined;
  heldAmount: number;
  frozenAmount: number;
  currencyCode: string;
  hasActiveInvestigation: boolean;
  defaultSellerDueDays?: number;
  onResolve: (payload: {
    outcome_type: DisputeOutcomeType;
    decision_summary: string;
    refund_amount: number;
    release_amount: number;
    internal_note?: string;
    notify_parties?: boolean;
    also_close_investigation?: boolean;
    acknowledge_frozen_funds?: boolean;
  }) => Promise<void> | void;
  onRequestMoreInfo: (payload: {
    message: string;
    new_due_at: string;
    notify_seller?: boolean;
  }) => Promise<void> | void;
}

export function ResolveDisputeDialog({
  open, onOpenChange, moneyStatus, heldAmount, frozenAmount, currencyCode,
  hasActiveInvestigation, defaultSellerDueDays = 3, onResolve, onRequestMoreInfo,
}: Props) {
  const available = useMemo(() => Number(heldAmount || 0) + Number(frozenAmount || 0), [heldAmount, frozenAmount]);
  const [mode, setMode] = useState<Mode>("release_funds_to_seller");
  const [summary, setSummary] = useState("");
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [releaseAmount, setReleaseAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [notifyParties, setNotifyParties] = useState(true);
  const [closeInvestigation, setCloseInvestigation] = useState(false);

  // More info fields
  const [moreInfoMessage, setMoreInfoMessage] = useState("");
  const [newDueAt, setNewDueAt] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [ackFrozen, setAckFrozen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("release_funds_to_seller");
    setSummary("");
    setRefundAmount(String(available.toFixed(2)));
    setReleaseAmount(String(available.toFixed(2)));
    setNote("");
    setNotifyParties(true);
    setCloseInvestigation(false);
    setMoreInfoMessage("");
    setAckFrozen(false);
    const due = new Date(Date.now() + defaultSellerDueDays * 86400_000);
    setNewDueAt(due.toISOString().slice(0, 16));
  }, [open, available, defaultSellerDueDays]);

  useEffect(() => {
    if (mode === "refund_buyer" || mode === "dismissed_buyer_favor") {
      setRefundAmount(String(available.toFixed(2)));
      setReleaseAmount("0");
    } else if (mode === "release_funds_to_seller" || mode === "dismissed_seller_favor") {
      setReleaseAmount(String(available.toFixed(2)));
      setRefundAmount("0");
    } else if (mode === "partial_refund_release") {
      // keep user values; default split 50/50
      if (!Number(refundAmount) && !Number(releaseAmount)) {
        const half = available / 2;
        setRefundAmount(half.toFixed(2));
        setReleaseAmount(half.toFixed(2));
      }
    } else if (mode === "close_case_without_resolution") {
      setRefundAmount("0");
      setReleaseAmount("0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, available]);

  const refundNum = Number(refundAmount) || 0;
  const releaseNum = Number(releaseAmount) || 0;
  const isFrozen = moneyStatus === "funds_frozen";
  const isFinal = mode !== "request_more_information";
  const closeNoAction = mode === "close_case_without_resolution";
  const requiresFrozenAck = closeNoAction && isFrozen;

  const amountsValid = !isFinal ? true : (() => {
    if (mode === "refund_buyer" || mode === "dismissed_buyer_favor")
      return refundNum > 0 && refundNum <= available + 0.001;
    if (mode === "release_funds_to_seller" || mode === "dismissed_seller_favor")
      return releaseNum > 0 && releaseNum <= available + 0.001;
    if (mode === "partial_refund_release")
      return refundNum > 0 && releaseNum > 0 && refundNum + releaseNum <= available + 0.001;
    return true; // close_case_without_resolution
  })();

  const canSubmit = !submitting && (
    isFinal
      ? summary.trim().length >= 10 && amountsValid && (!requiresFrozenAck || ackFrozen)
      : moreInfoMessage.trim().length >= 10 && newDueAt && new Date(newDueAt).getTime() > Date.now()
  );

  const close = (v: boolean) => { if (!submitting) onOpenChange(v); };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (isFinal) {
        await onResolve({
          outcome_type: mode as DisputeOutcomeType,
          decision_summary: summary.trim(),
          refund_amount: Number(refundNum.toFixed(2)),
          release_amount: Number(releaseNum.toFixed(2)),
          internal_note: note.trim() || undefined,
          notify_parties: notifyParties,
          also_close_investigation: hasActiveInvestigation ? closeInvestigation : false,
          acknowledge_frozen_funds: requiresFrozenAck ? ackFrozen : false,
        });
      } else {
        await onRequestMoreInfo({
          message: moreInfoMessage.trim(),
          new_due_at: new Date(newDueAt).toISOString(),
          notify_seller: true,
        });
      }
      onOpenChange(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve Dispute</DialogTitle>
          <DialogDescription>
            Final outcomes are written to the immutable case record. Seller-favor outcomes only queue funds for admin release. Payout is never automatic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Escrow available</span>
            <span className="font-semibold tabular-nums">{formatMoney(available, currencyCode)}</span>
          </div>

          {isFrozen && isFinal && (
            <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Frozen funds will be routed into the selected outcome bucket. No separate unfreeze needed.</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Outcome</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {FINAL_OUTCOMES.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setMode(o.value)}
                  className={`text-left rounded-md border px-3 py-2 transition-colors ${
                    mode === o.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                  } min-h-11`}
                >
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{o.help}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode("request_more_information")}
                className={`text-left rounded-md border px-3 py-2 transition-colors sm:col-span-2 ${
                  mode === "request_more_information" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                } min-h-11`}
              >
                <div className="text-sm font-medium">Request more information</div>
                <div className="text-xs text-muted-foreground mt-0.5">Does not resolve the dispute. Extends seller response window.</div>
              </button>
            </div>
          </div>

          {isFinal && (
            <>
              {(mode === "refund_buyer" || mode === "dismissed_buyer_favor") && (
                <div className="space-y-1">
                  <Label htmlFor="refund_amt">Refund amount ({currencyCode})</Label>
                  <Input id="refund_amt" inputMode="decimal" value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)} />
                </div>
              )}
              {(mode === "release_funds_to_seller" || mode === "dismissed_seller_favor") && (
                <div className="space-y-1">
                  <Label htmlFor="release_amt">Release amount ({currencyCode})</Label>
                  <Input id="release_amt" inputMode="decimal" value={releaseAmount}
                    onChange={(e) => setReleaseAmount(e.target.value)} />
                </div>
              )}
              {mode === "partial_refund_release" && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="refund_amt_p">Refund amount</Label>
                    <Input id="refund_amt_p" inputMode="decimal" value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="release_amt_p">Release amount</Label>
                    <Input id="release_amt_p" inputMode="decimal" value={releaseAmount}
                      onChange={(e) => setReleaseAmount(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 text-xs text-muted-foreground">
                    Sum: {formatMoney(refundNum + releaseNum, currencyCode)} · Available: {formatMoney(available, currencyCode)}
                  </div>
                </div>
              )}
              {!amountsValid && (
                <div className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Amounts exceed available escrow or are invalid.
                </div>
              )}

              {closeNoAction && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Closing without resolution will not move money. If funds are frozen or held,
                      another admin action may still be required.
                    </span>
                  </div>
                  {requiresFrozenAck && (
                    <div className="flex items-start gap-2 pt-1 border-t border-amber-500/30">
                      <Checkbox
                        id="ack_frozen"
                        checked={ackFrozen}
                        onCheckedChange={(v) => setAckFrozen(v === true)}
                      />
                      <Label htmlFor="ack_frozen" className="text-sm font-normal cursor-pointer">
                        I understand funds will remain frozen until another admin action is taken.
                      </Label>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="summary">Decision summary</Label>
                <Textarea id="summary" rows={4} value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Explain the basis for this outcome. Visible in the case record." />
                <div className="text-xs text-muted-foreground">{summary.trim().length}/10 min characters</div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="note">Internal note (optional)</Label>
                <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Visible to admins only." />
              </div>

              <div className="flex items-start gap-2">
                <Checkbox id="notify" checked={notifyParties} onCheckedChange={(v) => setNotifyParties(v === true)} />
                <Label htmlFor="notify" className="text-sm font-normal cursor-pointer">
                  Notify buyer and seller (neutral outcome message)
                </Label>
              </div>

              {hasActiveInvestigation && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div>There is still an open investigation for this transaction. Resolving this dispute will not close the investigation.</div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="close_inv" checked={closeInvestigation}
                          onCheckedChange={(v) => setCloseInvestigation(v === true)} />
                        <Label htmlFor="close_inv" className="text-sm font-normal cursor-pointer">
                          Also mark investigation as resolved
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {!isFinal && (
            <>
              <div className="space-y-1">
                <Label htmlFor="more_info">Message to seller</Label>
                <Textarea id="more_info" rows={4} value={moreInfoMessage}
                  onChange={(e) => setMoreInfoMessage(e.target.value)}
                  placeholder="Describe the additional information you need." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="due_at">New seller response deadline</Label>
                <Input id="due_at" type="datetime-local" value={newDueAt}
                  onChange={(e) => setNewDueAt(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isFinal ? "Resolve Dispute" : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}