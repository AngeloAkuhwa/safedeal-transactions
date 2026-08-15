import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import {
  fetchIdentityQueue,
  reviewIdentitySubmission,
  type IdentityStatus,
  type IdentitySubmission,
} from "@/services/admin-identity.service";
import { format } from "date-fns";
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

const TITLE = "Identity Review";
const SUBTITLE = "Approve or reject seller identity submissions — payouts depend on this queue";

const TABS: { key: IdentityStatus; label: string }[] = [
  { key: "pending_review", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
  { key: "more_info_needed", label: "More Info" },
];

const fmt = (v: string | null) => (v ? format(new Date(v), "MMM dd, yyyy HH:mm") : "—");

export default function AdminIdentity() {
  const qc = useQueryClient();
  const { has, isSuper } = useAdminPermissions();
  const canDecide = isSuper || has("identity_verification.approve");

  const [status, setStatus] = useState<IdentityStatus>("pending_review");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<
    { row: IdentitySubmission; decision: "approve" | "reject" } | null
  >(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-identity-queue", status, page],
    queryFn: () => fetchIdentityQueue(status, page),
    staleTime: 30_000,
  });

  const review = useMutation({
    mutationFn: reviewIdentitySubmission,
    onSuccess: (_d, vars) => {
      toast({
        title: vars.decision === "approve" ? "Identity approved" : "Identity rejected",
      });
      setPending(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-identity-queue"] });
    },
    onError: (e: Error) =>
      toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  const rows = data?.submissions ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.per_page ?? 20)));

  return (
    <AdminLayout title={TITLE} subtitle={SUBTITLE}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setStatus(t.key);
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  status === t.key
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                } min-h-11`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-[320px] rounded-xl" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No submissions in this queue.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <article key={r.id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium">{r.submitter?.full_name ?? "Unknown user"}</p>
                    <p className="text-xs text-muted-foreground">{r.submitter?.email ?? "—"}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Legal name</dt><dd>{r.legal_name ?? "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Method</dt><dd>{r.verification_method ?? "—"}</dd></div>
                    <div><dt className="text-muted-foreground">ID</dt><dd className="font-mono">{r.masked_identifier ?? "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Level</dt><dd>{r.verification_level}</dd></div>
                    <div><dt className="text-muted-foreground">Submitted</dt><dd>{fmt(r.submitted_at)}</dd></div>
                  </dl>
                  {r.status === "pending_review" && canDecide ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => { setReason(""); setPending({ row: r, decision: "approve" }); }}>Approve</Button>
                      <Button variant="destructive" onClick={() => { setReason(""); setPending({ row: r, decision: "reject" }); }}>Reject</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {r.status === "pending_review" ? "No permission" : `Reviewed ${fmt(r.reviewed_at)}`}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Submitter</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Legal Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Method / ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Level</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Submitted</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-3">
                      <p className="text-sm font-medium text-foreground">
                        {r.submitter?.full_name ?? "Unknown user"}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.submitter?.email ?? "—"}</p>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-foreground">{r.legal_name ?? "—"}</TableCell>
                    <TableCell className="py-3">
                      <p className="text-sm text-foreground">{r.verification_method ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.masked_identifier ?? "—"}</p>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{r.verification_level}</TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">{fmt(r.submitted_at)}</TableCell>
                    <TableCell className="py-3 text-right">
                      {r.status === "pending_review" && canDecide ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => { setReason(""); setPending({ row: r, decision: "approve" }); }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            onClick={() => { setReason(""); setPending({ row: r, decision: "reject" }); }}
                          >
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {r.status === "pending_review" ? "No permission" : `Reviewed ${fmt(r.reviewed_at)}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.decision === "approve" ? "Approve identity" : "Reject identity"}
            </DialogTitle>
            <DialogDescription>
              {pending?.row.submitter?.full_name ?? "This user"} — {pending?.row.masked_identifier ?? "no identifier"}.
              {pending?.decision === "approve"
                ? " Approving raises their verification level and unblocks payouts."
                : " Rejection reason is shared with the user and recorded in the audit log."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={pending?.decision === "approve" ? "Review notes (optional)" : "Rejection reason (required)"}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button
              variant={pending?.decision === "reject" ? "destructive" : "default"}
              disabled={
                review.isPending ||
                !pending ||
                (pending.decision === "reject" && reason.trim().length < 5)
              }
              onClick={() =>
                pending &&
                review.mutate({
                  submission_id: pending.row.id,
                  decision: pending.decision,
                  review_notes: reason.trim() || undefined,
                  rejection_reason: pending.decision === "reject" ? reason.trim() : undefined,
                })
              }
            >
              {review.isPending ? "Saving…" : pending?.decision === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
