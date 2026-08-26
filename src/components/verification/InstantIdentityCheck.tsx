import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ScanFace, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { startMetaMapVerification, getIdentityStatus } from "@/services/identity.service";

/**
 * The automated route, offered ahead of the manual one.
 *
 * Identity verification used to mean typing the last four digits of a NIN and
 * waiting for an admin to approve it. Those four digits are not checkable
 * against anything, so approving them recorded that somebody took the
 * applicant's word, and the applicant waited a day or two for that.
 *
 * This replaces the waiting with a document read, a liveness check and a face
 * match, and returns an answer in about a minute. The manual route stays
 * below, because a provider check can decline for reasons that are not fraud
 * (a document it cannot read, a country it does not cover) and a person who
 * hits that still needs a way through.
 *
 * The result never comes back through this component. It arrives at our
 * webhook from MetaMap, signature-checked, and is read back from our own
 * database. A screen that could report its own verification result would be
 * the entire vulnerability, so this one only opens a door and then watches
 * the database to see what happened.
 */

/** How long to keep watching after the person comes back. MetaMap's own
 *  answer usually lands within seconds; a slower one falls through to the
 *  pending state, which is honest rather than a spinner that never ends. */
const POLL_WINDOW_MS = 90_000;
const POLL_EVERY_MS = 3_000;

export function InstantIdentityCheck({
  legalName,
  disabled,
  onResolved,
}: {
  legalName?: string;
  disabled?: boolean;
  onResolved: () => void;
}) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [watching, setWatching] = useState(params.get("check") === "returned");

  const start = useMutation({
    mutationFn: () => startMetaMapVerification(legalName ? { legal_name: legalName } : undefined),
    onSuccess: ({ url }) => {
      // Same tab, deliberately. A popup is blocked often enough on mobile that
      // the flow would silently do nothing, and the hosted page sends the
      // person back here when it is finished.
      window.location.assign(url);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const { submission } = await getIdentityStatus();
        if (cancelled) return;
        if (submission && submission.status !== "pending_review") {
          setWatching(false);
          queryClient.invalidateQueries({ queryKey: ["identity-status"] });
          onResolved();
          return;
        }
      } catch {
        // A failed poll is not a result. Keep watching until the window ends
        // rather than telling someone their verification failed because our
        // own request did.
      }
      if (Date.now() - startedAt > POLL_WINDOW_MS) {
        setWatching(false);
        queryClient.invalidateQueries({ queryKey: ["identity-status"] });
        return;
      }
      setTimeout(tick, POLL_EVERY_MS);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [watching, queryClient, onResolved]);

  useEffect(() => {
    if (params.get("check") !== "returned") return;
    // Clear the marker so a refresh does not restart the watch.
    const next = new URLSearchParams(params);
    next.delete("check");
    setParams(next, { replace: true });
  }, [params, setParams]);

  if (watching) {
    return (
      <Card>
        <CardContent className="flex items-start gap-4 pt-6">
          <Loader2
            className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">Checking your documents</p>
            <p className="text-sm text-muted-foreground">
              This usually takes under a minute. You can leave this page; we will email you either
              way.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-start gap-4">
          <ScanFace className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">Verify in about a minute</p>
            <p className="text-sm text-muted-foreground">
              Photograph a passport, driver's licence, national ID or voter's card, then take a
              selfie. Most people are verified straight away. If anything needs a closer look, it
              goes to our team instead.
            </p>
          </div>
        </div>

        <Button
          onClick={() => start.mutate()}
          disabled={disabled || start.isPending}
          className="min-h-11 self-start gap-2"
        >
          {start.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          )}
          {start.isPending ? "Opening" : "Verify my identity"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Your documents go to our verification provider, not to sellers. Sellers only ever see
          your trust level.
        </p>
      </CardContent>
    </Card>
  );
}
