import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Link2,
  Monitor,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { formatRelative } from "@/components/admin/dashboard/relative";
import { ADMIN_TONE, ADMIN_GROUND, type AdminTone } from "@/components/admin/palette";
import {
  fetchErrorSummary,
  fetchErrorDetail,
  fetchErrorTrail,
  acknowledgeErrorGroup,
  type ErrorGroup,
  type ErrorEvent,
  type ErrorSeverity,
  type ErrorWindow,
} from "@/services/admin-error-events.service";

/**
 * The error log.
 *
 * Grouped by fingerprint, never a flat list. The realistic shape of this data
 * is one defect repeating thousands of times, and a page that renders 4,000
 * identical rows has hidden the second defect underneath the first.
 *
 * Three questions this screen has to answer, in the order an operator asks
 * them: is anything on fire right now, what is this one defect doing over
 * time, and what happened to this specific person's attempt. The summary bar
 * is the first, the sparkline is the second, and the correlation trail is the
 * third.
 */

const SEVERITY_TONE: Record<ErrorSeverity, AdminTone> = {
  fatal: "danger",
  error: "elevated",
  warning: "warning",
};

const SEVERITY_LABEL: Record<ErrorSeverity, string> = {
  fatal: "Fatal",
  error: "Error",
  warning: "Warning",
};

const WINDOW_LABEL: Record<ErrorWindow, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

/** Turn a kind slug into something readable without inventing a mapping that
 *  goes stale: kinds are free text on purpose, so a new one still renders. */
const kindLabel = (kind: string) =>
  kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function SeverityPill({ severity }: { severity: ErrorSeverity }) {
  const tone = ADMIN_TONE[SEVERITY_TONE[severity]];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${tone.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function SourcePill({ source }: { source: "client" | "edge" }) {
  const Icon = source === "edge" ? Server : Monitor;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {source === "edge" ? "Server" : "Browser"}
    </span>
  );
}

/**
 * Occurrences over the window.
 *
 * Deliberately not a chart library: a count per bucket normalised to the tallest
 * one answers the only question being asked, which is whether this is a spike
 * that has passed or something still firing. Colour is not carrying the meaning,
 * the shape is, and the numbers sit in the label beside it.
 */
function Sparkline({ buckets, tone }: { buckets: number[]; tone: AdminTone }) {
  const peak = Math.max(1, ...buckets);
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden="true">
      {buckets.map((n, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${n ? ADMIN_TONE[tone].dot : "bg-border"}`}
          style={{ height: n ? `${Math.max(12, (n / peak) * 100)}%` : "6%" }}
        />
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: AdminTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ? ADMIN_TONE[tone].text : "text-foreground"}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function EventCard({ event }: { event: ErrorEvent }) {
  const context = event.context && Object.keys(event.context).length ? event.context : null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={event.severity} />
        <SourcePill source={event.source} />
        <span className="text-xs text-muted-foreground">{formatRelative(event.occurred_at)}</span>
        {event.http_status ? (
          <span className="text-xs text-muted-foreground">HTTP {event.http_status}</span>
        ) : null}
      </div>

      <p className="mt-3 break-words text-sm text-foreground">{event.message}</p>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {[
          ["Where", event.route ?? event.function_name],
          ["Kind", kindLabel(event.kind)],
          ["Release", event.release],
          ["Viewport", event.viewport],
          ["Session", event.session_id ? event.session_id.slice(0, 8) : null],
          ["Account", event.user_id ? event.user_id.slice(0, 8) : "Signed out"],
        ]
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => (
            <div key={k as string} className="flex gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-mono text-foreground">{v}</dd>
            </div>
          ))}
      </dl>

      {event.stack ? (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          {event.stack}
        </pre>
      ) : null}

      {context ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {JSON.stringify(context, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function GroupRow({
  group,
  onOpen,
  onAcknowledge,
  acknowledging,
}: {
  group: ErrorGroup;
  onOpen: () => void;
  onAcknowledge: () => void;
  acknowledging: boolean;
}) {
  const tone = SEVERITY_TONE[group.severity];
  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-colors ${
        group.acknowledged ? "border-border opacity-70" : `${ADMIN_TONE[tone].panel} border`
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <button
          type="button"
          onClick={onOpen}
          className="min-h-11 flex-1 text-left"
          aria-label={`Open ${group.message}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={group.severity} />
            <SourcePill source={group.source} />
            <span className="text-xs text-muted-foreground">{kindLabel(group.kind)}</span>
            {group.acknowledged ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3 w-3" aria-hidden="true" />
                Acknowledged
              </span>
            ) : null}
          </div>

          <p className="mt-2 break-words text-sm font-medium text-foreground">{group.message}</p>

          <p className="mt-1 text-xs text-muted-foreground">
            {group.route ?? group.function_name ?? "Location not recorded"}
            {" · "}
            {group.count.toLocaleString()} {group.count === 1 ? "occurrence" : "occurrences"}
            {" · "}
            {group.affected_users
              ? `${group.affected_users.toLocaleString()} ${group.affected_users === 1 ? "account" : "accounts"}`
              : `${group.affected_sessions.toLocaleString()} ${group.affected_sessions === 1 ? "session" : "sessions"}`}
            {" · last "}
            {formatRelative(group.last_seen)}
          </p>
        </button>

        <div className="flex items-center gap-3 lg:shrink-0">
          <Sparkline buckets={group.by_hour} tone={tone} />
          {!group.acknowledged ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={onAcknowledge}
              disabled={acknowledging}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Acknowledge</span>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="min-h-11" onClick={onOpen} aria-label="Open details">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminErrors() {
  const queryClient = useQueryClient();

  const [windowKey, setWindowKey] = useState<ErrorWindow>("24h");
  const [severity, setSeverity] = useState<ErrorSeverity | "all">("all");
  const [source, setSource] = useState<"client" | "edge" | "all">("all");
  const [unackOnly, setUnackOnly] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<ErrorGroup | null>(null);
  const [trailId, setTrailId] = useState<string | null>(null);

  const query = { window: windowKey, severity, source, q: search, unacknowledged: unackOnly };

  const summary = useQuery({
    queryKey: ["admin-errors", query],
    queryFn: () => fetchErrorSummary(query),
    // Short enough to be useful while watching a live incident, long enough
    // that leaving the tab open does not become its own load.
    refetchInterval: 60_000,
  });

  const detail = useQuery({
    queryKey: ["admin-errors-detail", openGroup?.fingerprint, windowKey],
    queryFn: () => fetchErrorDetail(openGroup!.fingerprint, windowKey),
    enabled: Boolean(openGroup),
  });

  const trail = useQuery({
    queryKey: ["admin-errors-trail", trailId],
    queryFn: () => fetchErrorTrail(trailId!),
    enabled: Boolean(trailId),
  });

  const acknowledge = useMutation({
    mutationFn: ({ fingerprint, before }: { fingerprint: string; before: string }) =>
      acknowledgeErrorGroup(fingerprint, before),
    onSuccess: (result) => {
      toast.success(
        `Acknowledged ${result.acknowledged.toLocaleString()} ${result.acknowledged === 1 ? "event" : "events"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-errors"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const s = summary.data?.summary;
  const groups = summary.data?.groups ?? [];

  const worst = useMemo<AdminTone | undefined>(() => {
    if (!s) return undefined;
    if (s.by_severity.fatal) return "danger";
    if (s.by_severity.error) return "elevated";
    if (s.by_severity.warning) return "warning";
    return undefined;
  }, [s]);

  return (
    <AdminLayout title="Error Log" subtitle="Every client and server failure, grouped by defect">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <form
              className="flex min-w-[16rem] flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchDraft.trim());
              }}
            >
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search message, route or function"
                  className="min-h-11 pl-9"
                  aria-label="Search errors"
                />
              </div>
              <Button type="submit" variant="outline" className="min-h-11">
                Search
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={windowKey} onValueChange={(v) => setWindowKey(v as ErrorWindow)}>
              <SelectTrigger className="min-h-11 w-[10.5rem]" aria-label="Time window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WINDOW_LABEL) as ErrorWindow[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {WINDOW_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={severity} onValueChange={(v) => setSeverity(v as ErrorSeverity | "all")}>
              <SelectTrigger className="min-h-11 w-[8.5rem]" aria-label="Severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="fatal">Fatal</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>

            <Select value={source} onValueChange={(v) => setSource(v as "client" | "edge" | "all")}>
              <SelectTrigger className="min-h-11 w-[8.5rem]" aria-label="Source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="client">Browser</SelectItem>
                <SelectItem value="edge">Server</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={unackOnly ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setUnackOnly((v) => !v)}
              aria-pressed={unackOnly}
            >
              Unacknowledged
            </Button>

            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => summary.refetch()}
              disabled={summary.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${summary.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>

        {summary.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : summary.isError ? (
          <div className={`rounded-lg border p-6 ${ADMIN_TONE.danger.panel}`}>
            <p className={`text-sm font-medium ${ADMIN_TONE.danger.text}`}>
              The error log could not be loaded
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {(summary.error as Error)?.message}
            </p>
          </div>
        ) : s ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Events"
                value={`${s.truncated ? "at least " : ""}${s.total.toLocaleString()}`}
                hint={WINDOW_LABEL[windowKey]}
                tone={worst}
              />
              <StatTile
                label="Distinct defects"
                value={s.groups.toLocaleString()}
                hint={`${s.unacknowledged.toLocaleString()} events not yet acknowledged`}
              />
              <StatTile
                label="Accounts affected"
                value={s.affected_users.toLocaleString()}
                hint={`${s.affected_sessions.toLocaleString()} browser sessions`}
              />
              <StatTile
                label="Split"
                value={`${(s.by_source.client ?? 0).toLocaleString()} / ${(s.by_source.edge ?? 0).toLocaleString()}`}
                hint="Browser / server"
              />
            </div>

            {s.top_locations.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Worst locations
                </span>
                {s.top_locations.map((l) => (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() => {
                      setSearchDraft(l.name);
                      setSearch(l.name);
                    }}
                    className={`min-h-11 rounded-md border px-3 text-xs ${ADMIN_GROUND.borderSoft} border-border bg-muted/40 text-muted-foreground hover:bg-muted`}
                  >
                    <span className="font-mono text-foreground">{l.name}</span>{" "}
                    {l.count.toLocaleString()}
                  </button>
                ))}
              </div>
            ) : null}

            {groups.length ? (
              <div className="space-y-3">
                {groups.map((g) => (
                  <GroupRow
                    key={g.fingerprint}
                    group={g}
                    onOpen={() => setOpenGroup(g)}
                    onAcknowledge={() =>
                      acknowledge.mutate({ fingerprint: g.fingerprint, before: g.last_seen })
                    }
                    acknowledging={acknowledge.isPending}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-10 text-center">
                <Check className={`mx-auto h-8 w-8 ${ADMIN_TONE.success.text}`} aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-foreground">Nothing failed in this window</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {search || severity !== "all" || source !== "all" || unackOnly
                    ? "No events match these filters. Widen the window or clear a filter."
                    : "No client or server errors were reported."}
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>

      <Sheet open={Boolean(openGroup)} onOpenChange={(o) => !o && setOpenGroup(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="break-words text-left">{openGroup?.message}</SheetTitle>
            <SheetDescription className="text-left">
              {openGroup
                ? `${openGroup.count.toLocaleString()} occurrences, first ${formatRelative(openGroup.first_seen)}, last ${formatRelative(openGroup.last_seen)}`
                : null}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {openGroup?.sample_correlation_id ? (
              <Button
                variant="outline"
                className="min-h-11 w-full justify-start"
                onClick={() => setTrailId(openGroup.sample_correlation_id)}
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Follow this attempt across browser and server
              </Button>
            ) : null}

            {detail.isLoading ? (
              <>
                <Skeleton className="h-40 rounded-lg" />
                <Skeleton className="h-40 rounded-lg" />
              </>
            ) : detail.isError ? (
              <p className={`text-sm ${ADMIN_TONE.danger.text}`}>
                {(detail.error as Error)?.message}
              </p>
            ) : (
              (detail.data?.events ?? []).map((e) => <EventCard key={e.id} event={e} />)
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(trailId)} onOpenChange={(o) => !o && setTrailId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="text-left">Attempt trail</SheetTitle>
            <SheetDescription className="text-left">
              Everything logged under this correlation id, oldest first, so a server cause reads
              above the browser symptom it produced.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {trail.isLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : trail.isError ? (
              <p className={`text-sm ${ADMIN_TONE.danger.text}`}>
                {(trail.error as Error)?.message}
              </p>
            ) : (trail.data?.events ?? []).length ? (
              (trail.data?.events ?? []).map((e) => <EventCard key={e.id} event={e} />)
            ) : (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <AlertTriangle
                  className={`mx-auto h-7 w-7 ${ADMIN_TONE.warning.text}`}
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-foreground">
                  Only one side of this attempt was recorded
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The browser reported a failure but no server function logged against the same id,
                  which usually means the request never reached one.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
