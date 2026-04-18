import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Shield, Lock, Clock, AlertTriangle, Mail, Package, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { viewOffer, claimOffer } from "@/services/buyer-offers.service";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function OfferClaimLanding() {
  const { offerToken } = useParams<{ offerToken: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session));
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["offer-claim", offerToken, authed],
    queryFn: () => viewOffer(offerToken!),
    enabled: !!offerToken && authed !== null,
  });

  const claimMut = useMutation({
    mutationFn: () => claimOffer(offerToken!),
    onSuccess: (res) => {
      if (res.scenario === "claimed" && res.product) {
        toast({ title: "Offer claimed!", description: "Continue to checkout to complete your purchase." });
        navigate(`/dashboard/offers`);
      } else {
        refetch();
      }
    },
    onError: (err: Error) => toast({ title: "Failed to claim", description: err.message, variant: "destructive" }),
  });

  // Handle redirects for terminal scenarios
  useEffect(() => {
    if (data?.scenario === "resume_transaction" && data.transaction_id) {
      navigate(`/t/${offerToken}/pay`);
    }
    if (data?.scenario === "already_purchased" && data.transaction_id) {
      navigate(`/dashboard/transactions/${data.transaction_id}`);
    }
  }, [data, navigate, offerToken]);

  if (isLoading || authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <ErrorScreen title="Offer not found" message="This offer link is invalid or has been removed." />
    );
  }

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
    return <ErrorScreen icon={<XCircle className="h-10 w-10 text-destructive" />} title="Offer no longer available" message="The seller cancelled this private offer." />;
  }

  if (data.scenario === "wrong_account") {
    return (
      <ErrorScreen
        icon={<AlertTriangle className="h-10 w-10 text-warning" />}
        title="This offer is for a different account"
        message={`This private offer was sent to ${data.intended_email_hint}. Sign out and sign in with that account to claim it.`}
        action={
          <Button onClick={async () => { await supabase.auth.signOut(); navigate(`/auth?redirect=/offer/${offerToken}`); }}>
            Sign in with different account
          </Button>
        }
      />
    );
  }

  // anon_view or ready_to_claim — show offer
  const product = data.product;
  const seller = data.seller;
  const offer = data.offer;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-3 bg-primary/10 text-primary border-primary/30 hover:bg-primary/15">
            <Lock className="h-3 w-3 mr-1.5" /> Private Offer
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">A private offer just for you</h1>
          <p className="text-muted-foreground mt-2">
            From <span className="font-semibold text-foreground">{seller?.full_name}</span>
          </p>
        </div>

        <Card className="overflow-hidden shadow-xl border-border/60 mb-6">
          {product?.media?.[0]?.file_url && (
            <div className="aspect-video bg-muted">
              <img src={product.media[0].file_url} alt={product.title} className="w-full h-full object-cover" />
            </div>
          )}
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{product?.title}</h2>
              {product?.short_description && (
                <p className="text-sm text-muted-foreground mt-2">{product.short_description}</p>
              )}
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Offer price</span>
              <span className="text-3xl font-bold text-foreground">
                {product?.currency_code} {Number(product?.unit_price).toLocaleString()}
              </span>
            </div>
            {offer?.expires_at && (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 rounded-lg p-3">
                <Clock className="h-3.5 w-3.5" />
                Expires on {new Date(offer.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action area */}
        {data.scenario === "anon_view" && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 text-center space-y-4">
              <Mail className="h-8 w-8 text-primary mx-auto" />
              <div>
                <h3 className="font-semibold text-foreground">Sign in to claim this offer</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This offer was sent to <span className="font-mono">{data.intended_email_hint}</span>
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate(`/auth?redirect=/offer/${offerToken}`)}>
                  Sign in / Sign up <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {data.scenario === "ready_to_claim" && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="p-6 text-center space-y-4">
              <CheckCircle className="h-8 w-8 text-success mx-auto" />
              <div>
                <h3 className="font-semibold text-foreground">Ready to claim</h3>
                <p className="text-sm text-muted-foreground mt-1">Accept this offer to view it in your inbox and continue to secure checkout.</p>
              </div>
              <Button
                size="lg"
                onClick={() => claimMut.mutate()}
                disabled={claimMut.isPending}
                className="gap-2"
              >
                {claimMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Claim offer & continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Protected by SafeDeal escrow
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
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
