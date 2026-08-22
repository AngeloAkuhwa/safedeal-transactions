import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Loader2, ShieldCheck, Upload, UserCheck, ChevronRight, AlertTriangle, CheckCircle2, Clock, XCircle, Send, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { getBuyerProfile } from "@/services/profile.service";
import {
  getIdentityStatus,
  submitIdentity,
  resubmitIdentity,
  type IdentitySubmission,
  type IdentityVerificationMethod,
} from "@/services/identity.service";
import { toast } from "@/components/ui/sonner";
import { resolveVerificationStatusLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
import { PageSkeleton } from "@/components/common/PageSkeleton";

const BuyerVerification = () => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    retry: 1,
    staleTime: 30_000,
  });

  const { data: identityData, isLoading: identityLoading } = useQuery({
    queryKey: ["identity-status"],
    queryFn: getIdentityStatus,
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton label="Loading your verification status" />
    );
  }

  const submission = identityData?.submission ?? (data as any)?.identity_submission ?? null;
  const level = data.verification?.verification_level || "unverified";
  const isBasicVerified = level !== "unverified";

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <BuyerNav buyerName={data.profile.full_name} avatarUrl={data.profile.avatar_url} />

      {/* Compact header */}
      <section className="border-b bg-card/50">
        <div className="sd-page sd-page-y">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/dashboard/profile" className="hover:text-foreground transition-colors">Profile</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Verification</span>
          </nav>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="sd-page-title">Identity Verification</h1>
              <p className="sd-page-sub">
                Submit your identity to unlock higher transaction limits and trusted buyer status
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Prerequisites check */}
        {!isBasicVerified && (
          <Card className="border-warning/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Prerequisites Required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Complete phone verification and location setup before submitting identity verification.
                  </p>
                  <Link to="/dashboard/profile">
                    <Button variant="outline" size="sm" className="mt-3">
                      Go to Profile Settings
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status display */}
        {submission && <SubmissionStatus submission={submission} />}

        {/* Form: show when no submission, or rejected/more_info_needed */}
        {isBasicVerified && (!submission || submission.status === "rejected" || submission.status === "more_info_needed") && (
          <IdentitySubmissionForm
            existingSubmission={submission}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["identity-status"] });
              queryClient.invalidateQueries({ queryKey: ["buyer-profile"] });
            }}
          />
        )}

        {/* What happens next */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { icon: Upload, title: "Submit Your Identity", desc: "Choose NIN-based identity submission (manual review) or government-issued ID. Your full NIN is never transmitted or stored. Only the last 4 digits are retained." },
              { icon: Clock, title: "Manual Review", desc: "Our team reviews your submission within 24–48 hours. This is not automated verification." },
              { icon: UserCheck, title: "Get Verified", desc: "Once approved, you unlock higher limits and trusted buyer status." },
            ].map((step, idx) => (
              <div key={idx} className="flex items-start gap-4 rounded-lg border p-4">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <step.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Privacy notice */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Your Privacy is Protected</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Your identity data is stored securely, accessible only to you and our review team.
                  Sellers only see your trust level, never your identity documents or NIN.
                  Only minimal data is retained: masked identifiers are preferred, and uploaded documents
                  are tightly access-controlled.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

function SubmissionStatus({ submission }: { submission: IdentitySubmission }) {
  const ICONS: Record<string, typeof CheckCircle2> = {
    pending_review: Clock,
    verified: CheckCircle2,
    rejected: XCircle,
    more_info_needed: AlertTriangle,
  };
  const entry = resolveVerificationStatusLabel(submission.status);
  const Icon = ICONS[submission.status] ?? Clock;
  const toneClass = TONE_CLASSNAMES[entry.tone];

  return (
    <Card className={`border ${toneClass}`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Identity Submission</p>
              <Badge variant="outline" className={toneClass}>{entry.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Method: {submission.verification_method === "nin" ? "NIN" : "Government ID"} · 
              Submitted: {new Date(submission.submitted_at).toLocaleDateString()}
            </p>
            {submission.rejection_reason && (
              <div className="mt-2 p-3 rounded-lg bg-background border">
                <p className="text-xs font-medium text-foreground">Reason:</p>
                <p className="text-xs text-muted-foreground">{submission.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IdentitySubmissionForm({
  existingSubmission,
  onSuccess,
}: {
  existingSubmission: IdentitySubmission | null;
  onSuccess: () => void;
}) {
  const isResubmit = !!existingSubmission;

  const [legalName, setLegalName] = useState(existingSubmission?.legal_name || "");
  const [method, setMethod] = useState<IdentityVerificationMethod>(existingSubmission?.verification_method || "nin");
  const [ninInput, setNinInput] = useState("");
  const [maskedNin, setMaskedNin] = useState(existingSubmission?.masked_identifier || "");
  const [dob, setDob] = useState(existingSubmission?.date_of_birth || "");
  const [consent, setConsent] = useState(false);

  const handleNinBlur = () => {
    if (ninInput.length >= 4) {
      const last4 = ninInput.slice(-4);
      setMaskedNin(`****${last4}`);
      setNinInput(""); // Clear raw input
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (isResubmit) {
        return resubmitIdentity({
          legal_name: legalName,
          masked_identifier: method === "nin" ? maskedNin : undefined,
          date_of_birth: dob || undefined,
        });
      }
      return submitIdentity({
        legal_name: legalName,
        verification_method: method,
        masked_identifier: method === "nin" ? maskedNin : undefined,
        date_of_birth: dob || undefined,
        consent_accepted: consent,
      });
    },
    onSuccess: () => {
      toast.success(isResubmit ? "Identity resubmitted for review" : "Identity submitted for review");
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = legalName.trim().length > 0 &&
    (method === "nin" ? maskedNin.length > 0 : false) && // Gov ID upload not implemented yet
    (isResubmit || consent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {isResubmit ? "Resubmit Identity" : "Submit Identity for Verification"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Legal name */}
        <div className="space-y-2">
          <Label htmlFor="legal-name">Legal Full Name</Label>
          <Input
            id="legal-name"
            placeholder="Enter your full legal name as it appears on your ID"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* Method selector */}
        {!isResubmit && (
          <div className="space-y-2">
            <Label>Verification Method</Label>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as IdentityVerificationMethod)}>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="nin" id="nin" />
                <Label htmlFor="nin" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">NIN (National Identification Number)</p>
                  <p className="text-xs text-muted-foreground">Only the last 4 digits are stored</p>
                </Label>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3 opacity-50">
                <RadioGroupItem value="government_id" id="gov-id" disabled />
                <Label htmlFor="gov-id" className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">Government-Issued ID Upload</p>
                  <p className="text-xs text-muted-foreground">Coming soon: passport, driver's license, or voter's card</p>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* NIN input */}
        {method === "nin" && (
          <div className="space-y-2">
            <Label htmlFor="nin-input">
              {maskedNin ? "NIN (masked)" : "Enter your NIN"}
            </Label>
            {maskedNin ? (
              <div className="flex items-center gap-2">
                <Input value={maskedNin} readOnly className="bg-muted" />
                <Button variant="outline" size="sm" onClick={() => { setMaskedNin(""); setNinInput(""); }}>
                  Change
                </Button>
              </div>
            ) : (
              <Input
                id="nin-input"
                type="password"
                placeholder="Enter your 11-digit NIN"
                value={ninInput}
                onChange={(e) => setNinInput(e.target.value.replace(/\D/g, "").slice(0, 11))}
                onBlur={handleNinBlur}
                maxLength={11}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Only the last 4 digits will be stored. Your full NIN is never saved.
            </p>
          </div>
        )}

        {/* DOB (optional) */}
        <div className="space-y-2">
          <Label htmlFor="dob">Date of Birth (optional)</Label>
          <Input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        {/* Consent */}
        {!isResubmit && (
          <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/50">
            <Checkbox
              id="consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(!!v)}
            />
            <Label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
              I consent to SafeDeal processing my identity information for verification purposes only.
              My data will be handled in accordance with applicable data protection regulations and will not
              be shared with other users or third parties without my consent.
            </Label>
          </div>
        )}

        <Button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit || submitMutation.isPending}
          className="w-full"
        >
          {submitMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {isResubmit ? "Resubmit for Review" : "Submit for Verification"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default BuyerVerification;
