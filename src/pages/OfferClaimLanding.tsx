// Thin resolver: validates token, redirects into the existing buyer flow.
// Renders only loading + error states — the happy path always navigates away.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Shield, Lock, Clock, AlertTriangle, Mail, ArrowRight, XCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { viewOffer, claimOffer } from "@/services/buyer-offers.service";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/common/PageSkeleton";

type Item = {
  id: string;
  product_title: string;
  short_description: string | null;
  quantity: number;
  unit_price_snapshot: number;
  currency_code: string;
  primary_media_url: string | null;
};

const isSafeRedirectPath = (path: unknown): path is string =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//");

export default function OfferClaimLanding() {
  const { offerToken } = useParams<{ offerToken: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Detect auth then load offer + auto-claim if signed in & matched
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const isAuthed = !!session;
      setAuthed(isAuthed);

      try {
        const result = await viewOffer(offerToken!);
        if (cancelled) return;

        // If signed in and matched → auto-claim → redirect into existing flow
        if (isAuthed && result.scenario === "ready_to_claim") {
          await runClaim();
          return;
        }
        // Resume / already_purchased terminal redirects
        if ((result as any).redirect_to) {
          const target = isSafeRedirectPath((result as any).redirect_to) ? (result as any).redirect_to : "/dashboard";
          navigate(target, { replace: true });
          return;
        }
        setData(result);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load offer");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerToken]);

  async function runClaim() {
    if (!offerToken) return;
    setClaiming(true);
    try {
      const result = await claimOffer(offerToken);
      if ((result as any).redirect_to) {
        const target = isSafeRedirectPath((result as any).redirect_to) ? (result as any).redirect_to : "/dashboard";
        navigate(target, { replace: true });
        return;
      }
      // No redirect (e.g. wrong_account, expired) — show state
      setData(result);
      setLoading(false);
    } catch (err: any) {
      toast({ title: "Failed to claim offer", description: err.message, variant: "destructive" });
      setErrorMsg(err.message);
    } finally {
      setClaiming(false);
    }
  }

  // Loading
  if (loading || authed === null || claiming) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
          <BlockSkeleton label={claiming ? "Claiming your offer" : "Loading the offer"} lines={2} />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <p className="text-center text-sm text-muted-foreground">
            {claiming ? "Claiming your offer…" : "Loading offer…"}
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return <ErrorScreen title="Something went wrong" message={errorMsg} />;
  }
  if (!data) {
    return <ErrorScreen title="Offer not found" message="This offer link is invalid or has been removed." />;
  }

  // Terminal scenarios
  if (data.scenario === "not_found") {
    return <ErrorScreen title="Offer not found" message={data.error || "This offer link is invalid."} />;
  }
  if (data.scenario === "expired") {
    return (
      <ErrorScreen
        icon={<Clock className="h-10 w-10 text-warning" />}
        title="This private offer has expired"
        message={`Contact ${data.seller?.full_name || "the seller"} to request a new offer.`}
      />
    );
  }
  if (data.scenario === "cancelled") {
    return (
      <ErrorScreen
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Offer no longer available"
        message="The seller cancelled this private offer."
      />
    );
  }
  if (data.scenario === "wrong_account") {
    return (
      <ErrorScreen
        icon={<AlertTriangle className="h-10 w-10 text-warning" />}
        title="This offer is for a different account"
        message={`Sent to ${data.intended_email_hint}. Sign out and sign in with that account to claim it.`}
        action={
          <Button onClick={async () => { await supabase.auth.signOut(); navigate(`/auth?redirect=/offer/${offerToken}`); }}>
            Sign in with different account
          </Button>
        }
      />
    );
  }
  if (data.scenario === "already_purchased") {
    return (
      <ErrorScreen
        icon={<Package className="h-10 w-10 text-success" />}
        title="Offer already purchased"
        message="This offer has been completed."
      />
    );
  }

  // Anonymous view — show preview + sign-in CTA
  if (data.scenario === "anon_view") {
    return (
      <AnonymousPreview
        seller={data.seller}
        items={data.items || []}
        offerToken={offerToken!}
        intendedEmail={data.intended_email_hint}
        navigate={navigate}
      />
    );
  }

  // ready_to_claim fallback (anon → just signed in but auto-claim didn't fire)
  if (data.scenario === "ready_to_claim") {
    return (
      /* Nothing is loading here — the buyer has just signed in and auto-claim
         did not fire, so this is a prompt, not a wait. The old spinner said
         "hold on" while the button said "act", which is a contradiction the
         user has to resolve. State the situation and give one clear action. */
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">You're signed in</h1>
            <p className="text-sm text-muted-foreground">
              One more tap to add this offer to your account.
            </p>
            <Button onClick={runClaim} disabled={claiming} className="w-full">
              {claiming ? "Claiming…" : "Continue to offer"}
              {!claiming && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ErrorScreen title="Unexpected state" message="Please refresh and try again." />;
}

function AnonymousPreview({
  seller, items, offerToken, intendedEmail, navigate,
}: {
  seller: any;
  items: Item[];
  offerToken: string;
  intendedEmail: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const total = items.reduce((sum, it) => sum + Number(it.unit_price_snapshot) * it.quantity, 0);
  const currency = items[0]?.currency_code || "NGN";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-3 bg-primary/10 text-primary border-primary/30 hover:bg-primary/15">
            <Lock className="h-3 w-3 mr-1.5" /> Private Offer
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">A private offer just for you</h1>
          <p className="text-muted-foreground mt-2">
            From <span className="font-semibold text-foreground">{seller?.full_name || "the seller"}</span>
          </p>
        </div>

        <Card className="overflow-hidden shadow-xl border-border/60 mb-6">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
              <span className="text-sm font-semibold text-foreground">{formatMoney(total, currency)}</span>
            </div>
            <div className="space-y-3">
              {items.slice(0, 3).map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {it.primary_media_url ? (
                      <img src={it.primary_media_url} alt={it.product_title} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{it.product_title}</p>
                    <p className="text-xs text-muted-foreground">Qty {it.quantity} · {formatMoney(Number(it.unit_price_snapshot), it.currency_code)}</p>
                  </div>
                </div>
              ))}
              {items.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">+ {items.length - 3} more item{items.length - 3 !== 1 ? "s" : ""}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6 text-center space-y-4">
            <Mail className="h-8 w-8 text-primary mx-auto" />
            <div>
              <h3 className="font-semibold text-foreground">Sign in to claim this offer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This offer was sent to <span className="font-mono">{intendedEmail}</span>
              </p>
            </div>
            <Button onClick={() => navigate(`/auth?redirect=/offer/${offerToken}`)}>
              Sign in / Sign up <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Protected by SafeDeal escrow
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({
  title, message, icon, action,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="flex justify-center">{icon || <AlertTriangle className="h-10 w-10 text-warning" />}</div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          {action || (
            <Button variant="outline" onClick={() => navigate("/")}>
              Back to home
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
