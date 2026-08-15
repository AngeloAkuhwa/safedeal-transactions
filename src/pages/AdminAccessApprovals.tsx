import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, FileClock, CheckCircle2, XCircle, ShieldAlert, AlertTriangle, ArrowRight } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  listAccessChangeRequests,
  reviewAccessChangeRequest,
  relativeTime,
  ROLE_LABEL,
  previewRequestSafeguards,
  fetchRequestDiff,
  type AccessChangeRequest,
  type SafeguardCheck,
  type RequestDiff,
} from "@/services/admin-access-control.service";
import { fetchAssignedWorkImpact } from "@/services/assigned-work.service";
import { useMutationOnce } from "@/hooks/useMutationOnce";

type StatusTab = "pending" | "approved" | "rejected" | "cancelled";

const TAB_LABEL: Record<StatusTab, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function typeLabel(t: AccessChangeRequest["change_type"]): string {
  return t === "role" ? "Role change"
    : t === "permission" ? "Permission override"
    : t === "suspend" ? "Suspension"
    : "Reactivation";
}

function summarise(req: AccessChangeRequest): string {
  const p = req.payload as Record<string, any>;
  if (req.change_type === "role") {
    const roles = Array.isArray(p.roles) ? p.roles : [];
    return roles.map((r: string) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).join(", ") || "—";
  }
  if (req.change_type === "permission") {
    return `${p.mode ?? ""} ${p.permission_key ?? ""}`.trim();
  }
  return req.reason ?? "—";
}

export default function AdminAccessApprovals() {
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as StatusTab | null) ?? "pending";
  const focusId = params.get("request");
  const [tab, setTab] = useState<StatusTab>(initialTab);
  const [selected, setSelected] = useState<AccessChangeRequest | null>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-access-approvals", tab],
    queryFn: () => listAccessChangeRequests(tab),
    staleTime: 15_000,
  });

  const rows = q.data ?? [];

  // Deep-link: open detail drawer for ?request=<id>
  useMemo(() => {
    if (!focusId || !rows.length) return;
    const r = rows.find((x) => x.id === focusId);
    if (r) setSelected(r);
  }, [focusId, rows]);

  const changeTab = (t: StatusTab) => {
    setTab(t);
    const next = new URLSearchParams(params);
    next.set("tab", t);
    next.delete("request");
    setParams(next, { replace: true });
  };

  const onReviewed = () => {
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["admin-access-approvals"] });
  };

  return (
    <AdminLayout title="Access approvals" subtitle="Review privileged access change requests">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/access-control"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Access &amp; Roles</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => changeTab(v as StatusTab)} className="mb-4">
        <TabsList>
          {(Object.keys(TAB_LABEL) as StatusTab[]).map((k) => (
            <TabsTrigger key={k} value={k}>{TAB_LABEL[k]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {q.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading requests…
        </div>
      ) : q.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center text-sm text-destructive">
          Could not load access change requests. Please retry.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FileClock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-semibold">No {TAB_LABEL[tab].toLowerCase()} requests</div>
          <div className="text-xs text-muted-foreground">Nothing to show in this queue.</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm sd-stack">
            <thead className="bg-muted/40 text-[12px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Target user</th>
                <th className="px-4 py-2 text-left">Requested by</th>
                <th className="px-4 py-2 text-left">Summary</th>
                <th className="px-4 py-2 text-left">Submitted</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[12px]">
                      {typeLabel(r.change_type)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-foreground/90">{r.target_name ?? r.target_user_id}</td>
                  <td className="px-4 py-2 text-foreground/80">{r.requested_by_name ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground/80">{summarise(r)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{relativeTime(r.created_at)}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Review</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReviewDrawer request={selected} onClose={() => setSelected(null)} onReviewed={onReviewed} />
    </AdminLayout>
  );
}

function ReviewDrawer({
  request, onClose, onReviewed,
}: {
  request: AccessChangeRequest | null;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [reason, setReason] = useState("");
  const isReadOnly = !!request && request.status !== "pending";

  const diffQ = useQuery({
    queryKey: ["access-approval-diff", request?.id],
    queryFn: () => fetchRequestDiff(request!),
    enabled: !!request,
  });

  const safeguardsQ = useQuery({
    queryKey: ["access-approval-safeguards", request?.id],
    queryFn: () => previewRequestSafeguards(request!),
    enabled: !!request && !isReadOnly,
  });

  const impactQ = useQuery({
    queryKey: ["access-approval-impact", request?.id],
    queryFn: async () => {
      const diff = await fetchRequestDiff(request!);
      const removedKeys = request!.change_type === "permission"
        ? diff.removed
        : []; // role-level impact isn't derivable from role names alone
      return fetchAssignedWorkImpact(request!.target_user_id, removedKeys);
    },
    enabled: !!request,
  });

  const blocking = (safeguardsQ.data ?? []).filter((s) => s.level === "block");
  const canDecide = !isReadOnly && !!reason.trim() && blocking.length === 0;

  const submit = useMutationOnce(async (decision: "approve" | "reject") => {
    if (!request) return;
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Enter a decision reason for the audit trail.", variant: "destructive" });
      return;
    }
    if (decision === "approve" && blocking.length > 0) {
      toast({ title: "Blocked by safeguard", description: blocking[0].message, variant: "destructive" });
      return;
    }
    try {
      await reviewAccessChangeRequest(request.id, decision, reason.trim());
      toast({ title: decision === "approve" ? "Request approved" : "Request rejected" });
      setReason("");
      onReviewed();
    } catch (e: any) {
      toast({ title: "Could not save decision", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  });

  const open = !!request;
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {request && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                {typeLabel(request.change_type)}
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Meta
                  label="Target user"
                  value={
                    <Link
                      to={`/admin/access-control?user=${request.target_user_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {request.target_name ?? request.target_user_id}
                    </Link>
                  }
                />
                <Meta label="Requested by" value={request.requested_by_name ?? "—"} />
                <Meta label="Submitted" value={relativeTime(request.created_at)} />
                <Meta label="Status" value={request.status} />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Reason</Label>
                <div className="mt-1 rounded-md border border-border bg-muted/20 p-3 text-sm">
                  {request.reason || <span className="text-muted-foreground">No reason provided</span>}
                </div>
              </div>

              {diffQ.data && <DiffPanel diff={diffQ.data} />}

              {impactQ.data && impactQ.data.open_items > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Impact
                  </div>
                  <div className="mt-1">
                    Approving this will affect <strong>{impactQ.data.open_items}</strong> open item(s) in{" "}
                    {impactQ.data.affected_modules.join(", ")}.
                  </div>
                </div>
              )}

              {!isReadOnly && safeguardsQ.data && safeguardsQ.data.length > 0 && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs">
                  <div className="mb-1 font-semibold text-red-200">Blocked by safeguard</div>
                  <ul className="space-y-0.5 text-red-100">
                    {safeguardsQ.data.map((s) => (
                      <li key={s.code}>
                        <span className="font-mono text-[12px] uppercase tracking-wider text-red-300">Rule {s.rule}</span>
                        {" — "}
                        {s.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Raw payload</Label>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-[12px]">
{JSON.stringify(request.payload, null, 2)}
                </pre>
              </div>

              {isReadOnly ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Reviewed {request.reviewed_at ? relativeTime(request.reviewed_at) : ""}.
                  {request.review_reason && (
                    <div className="mt-1 text-foreground/80">Decision reason: {request.review_reason}</div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="decision-reason" className="text-xs">Decision reason (required)</Label>
                    <Textarea
                      id="decision-reason"
                      className="mt-1"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain why you're approving or rejecting this request."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => submit.run("reject")}
                      disabled={submit.pending || !reason.trim()}
                    >
                      <XCircle className="mr-1 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      onClick={() => submit.run("approve")}
                      disabled={submit.pending || !canDecide}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground/90">{value}</div>
    </div>
  );
}

function DiffPanel({ diff }: { diff: RequestDiff }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        {diff.label} <ArrowRight className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <div className="mb-1 uppercase tracking-wider text-muted-foreground">Before</div>
          <ul className="space-y-0.5 text-foreground/80">
            {diff.before.length ? diff.before.map((v) => <li key={`b-${v}`}>{v}</li>) : <li className="text-muted-foreground">—</li>}
          </ul>
        </div>
        <div>
          <div className="mb-1 uppercase tracking-wider text-muted-foreground">After</div>
          <ul className="space-y-0.5 text-foreground/80">
            {diff.after.length ? diff.after.map((v) => <li key={`a-${v}`}>{v}</li>) : <li className="text-muted-foreground">—</li>}
          </ul>
        </div>
      </div>
      {(diff.added.length > 0 || diff.removed.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          {diff.added.map((v) => (
            <span key={`add-${v}`} className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
              + {v}
            </span>
          ))}
          {diff.removed.map((v) => (
            <span key={`rem-${v}`} className="rounded-md border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
              − {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}