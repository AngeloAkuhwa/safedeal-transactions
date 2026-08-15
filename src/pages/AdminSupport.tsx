import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Inbox,
  LifeBuoy,
  Loader2,
  Mail,
  RefreshCw,
  ScrollText,
  Bell,
  Landmark,
  Search,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAdminNav } from "@/components/admin/useAdminNav";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import {
  actOnSupportMessage,
  fetchSupportInbox,
  SUPPORT_SIZE,
  type SupportMessage,
  type SupportStatus,
} from "@/services/admin-support.service";
import { SUPPORT_INTERNAL_SLA } from "@/lib/support/support-copy";

const TABS: { key: SupportStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
];

const TOOLS = [
  {
    icon: ScrollText,
    label: "Audit Logs",
    href: "/admin/audit-logs",
    hint: "Who changed what, when, and why — start every investigation here.",
  },
  {
    icon: Bell,
    label: "Notifications",
    href: "/admin/notifications",
    hint: "Delivery status and retries for buyer, seller, and system alerts.",
  },
  {
    icon: Landmark,
    label: "Reconciliation",
    href: "/admin/reconciliation",
    hint: "Escrow drift, pricing snapshot coverage, and financial remediation.",
  },
];

const fmt = (v: string | null) => (v ? format(new Date(v), "MMM dd, yyyy HH:mm") : "—");

export default function AdminSupport() {
  const { go } = useAdminNav();
  const qc = useQueryClient();
  const { has, isSuper } = useAdminPermissions();
  const canView = isSuper || has("support.view");
  const canHandle = isSuper || has("support.update");

  const [status, setStatus] = useState<SupportStatus>("new");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState<SupportMessage | null>(null);
  const [reply, setReply] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-support-inbox", status, page, term],
    queryFn: () => fetchSupportInbox(status, page, term),
    enabled: canView,
    staleTime: 20_000,
  });

  const act = useMutation({
    mutationFn: actOnSupportMessage,
    onSuccess: (res, vars) => {
      toast({
        title:
          vars.action === "reply"
            ? res.emailed
              ? "Reply emailed"
              : "Reply saved (email not configured — contact the sender directly)"
            : "Message updated",
      });
      setActive(null);
      setReply("");
      void qc.invalidateQueries({ queryKey: ["admin-support-inbox"] });
    },
    onError: (e: Error) =>
      toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  const rows = data?.messages ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / SUPPORT_SIZE));

  return (
    <AdminLayout title="Support Center" subtitle="Buyer and seller messages, and first-line debugging">
      <div className="space-y-6 p-4 md:p-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Inbox className="h-4 w-4" /> Support inbox
            </h2>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{SUPPORT_INTERNAL_SLA}</p>

          {!canView ? (
            <Card className="p-6 text-sm text-muted-foreground">
              You do not have permission to read support messages.
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
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
                    <span className="ml-2 text-xs opacity-70">{data?.counts?.[t.key] ?? 0}</span>
                  </button>
                ))}
                <form
                  className="ml-auto flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPage(1);
                    setTerm(search);
                  }}
                >
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-11 w-56 pl-8"
                      placeholder="Email, name or reference"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Search
                  </Button>
                </form>
              </div>

              {isLoading ? (
                <Skeleton className="h-64 rounded-xl" />
              ) : rows.length === 0 ? (
                <Card className="p-10 text-center">
                  <Mail className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No messages in this queue.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {rows.map((m) => (
                    <Card key={m.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{m.full_name}</span>
                            <span className="text-xs text-muted-foreground">{m.email}</span>
                            <Badge variant="outline" className="text-[11px]">
                              {m.topic.replace(/_/g, " ")}
                            </Badge>
                            {m.transaction_reference && (
                              <Badge variant="outline" className="text-[11px]">
                                {m.transaction_reference}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {m.message}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Received {fmt(m.created_at)}
                            {m.replied_at ? ` · replied ${fmt(m.replied_at)}` : ""}
                          </p>
                          {m.admin_reply && (
                            <p className="mt-2 rounded-lg border border-border bg-muted/40 p-2 text-xs text-foreground">
                              {m.admin_reply}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          {canHandle && status !== "resolved" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActive(m);
                                  setReply("");
                                }}
                              >
                                Reply
                              </Button>
                              {m.status === "new" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={act.isPending}
                                  onClick={() => act.mutate({ id: m.id, action: "claim" })}
                                >
                                  Claim
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={act.isPending}
                                onClick={() => act.mutate({ id: m.id, action: "resolve" })}
                              >
                                Resolve
                              </Button>
                            </>
                          )}
                          {canHandle && status === "resolved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={act.isPending}
                              onClick={() => act.mutate({ id: m.id, action: "reopen" })}
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {page} of {totalPages} · {data?.total ?? 0} message(s)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <LifeBuoy className="h-4 w-4" /> Debug &amp; audit basics
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <Card key={t.href} className="flex flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {t.label}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 self-start"
                    onClick={() => go(t.href, t.label)}
                  >
                    Open {t.label}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>

        <Card className="p-4">
          <div className="text-sm font-medium text-foreground">Escalation checklist</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Capture the transaction code and the exact time the issue was reported.</li>
            <li>Check Audit Logs for the last state change on the record.</li>
            <li>For money movement, confirm the ledger position on Reconciliation before acting.</li>
            <li>Record the outcome as a transaction note so the next agent has full context.</li>
          </ol>
        </Card>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to {active?.full_name}</DialogTitle>
            <DialogDescription>
              SafeDeal will try to email {active?.email}. The reply is always stored on the
              message and audited — the confirmation after sending tells you whether the email
              actually went out.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={7}
            maxLength={4000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write the reply…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button
              disabled={act.isPending || reply.trim().length < 5}
              onClick={() => active && act.mutate({ id: active.id, action: "reply", reply })}
            >
              {act.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Send reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
