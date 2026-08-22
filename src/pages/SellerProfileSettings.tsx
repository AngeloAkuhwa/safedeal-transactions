import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserCog, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { PersonalInfoSection } from "@/components/profile/PersonalInfoSection";
import { SellerVerificationSection } from "@/components/profile/SellerVerificationSection";
import { SecuritySection } from "@/components/profile/SecuritySection";
import { NotificationPreferencesSection } from "@/components/profile/NotificationPreferencesSection";
import { PayoutDestinationSection } from "@/components/profile/PayoutDestinationSection";
import { DangerZoneSection } from "@/components/profile/DangerZoneSection";
import { TrustSafetyPanel } from "@/components/profile/TrustSafetyPanel";
import { AccountStatusCard } from "@/components/profile/AccountStatusCard";
import { EffectiveSettingsPanel } from "@/components/profile/EffectiveSettingsPanel";
import { VendorPlanSection } from "@/components/profile/VendorPlanSection";
import {
  getSellerProfile,
  updateSellerProfile,
  updateSellerPreferences,
  type SellerProfile,
  type NotificationPreferences,
} from "@/services/seller-profile.service";
import { toast } from "@/components/ui/sonner";
import { useSearchParams } from "react-router";
import { PageSkeleton } from "@/components/common/PageSkeleton";

const SellerProfileSettings = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-profile"],
    queryFn: getSellerProfile,
    retry: 1,
    staleTime: 30_000,
  });

  const [pendingChanges, setPendingChanges] = useState<Partial<SellerProfile>>({});
  const [pendingPrefs, setPendingPrefs] = useState<Partial<NotificationPreferences>>({});

  const hasPendingProfile = Object.keys(pendingChanges).length > 0;
  const hasPendingPrefs = Object.keys(pendingPrefs).length > 0;
  const hasPending = hasPendingProfile || hasPendingPrefs;

  // Scroll to the requested section (e.g. ?section=payout or ?section=identity)
  useEffect(() => {
    const section = searchParams.get("section");
    if (!section) return;
    const el = document.getElementById(section);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [searchParams]);

  const handleProfileChange = useCallback((updates: Partial<SellerProfile>) => {
    setPendingChanges((prev) => ({ ...prev, ...updates }));
  }, []);

  const handlePrefToggle = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      setPendingPrefs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const promises: Promise<unknown>[] = [];

      if (hasPendingProfile) {
        promises.push(
          updateSellerProfile({
            full_name: pendingChanges.full_name,
            phone: pendingChanges.phone ?? undefined,
            country_code: pendingChanges.country_code,
            state_name: pendingChanges.state_name,
            city_name: pendingChanges.city_name,
          })
        );
      }

      if (hasPendingPrefs) {
        promises.push(updateSellerPreferences(pendingPrefs));
      }

      await Promise.all(promises);
    },
    onSuccess: () => {
      toast.success("Settings saved successfully");
      setPendingChanges({});
      setPendingPrefs({});
      queryClient.invalidateQueries({ queryKey: ["seller-profile"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const displayPrefs: NotificationPreferences | undefined = data?.preferences
    ? { ...data.preferences, ...pendingPrefs }
    : undefined;

  if (isLoading) {
    return (
      <PageSkeleton label="Loading your profile settings" />
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Could not load your profile</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {(error as Error)?.message || "Please refresh or try again later."}
        </p>
        <Button onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SellerNav sellerName={data.profile.full_name} avatarUrl={data.profile.avatar_url} />

      {/* Compact header */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/60">
        <div className="sd-page py-3 sm:py-4 flex items-center gap-2.5">
          <UserCog className="shrink-0 h-4 w-4 text-primary" />
          <div className="min-w-0">
            <h1 className="sd-page-title">Profile & Settings</h1>
            <p className="sd-page-sub">
              Manage your account, verification status, security, notifications, and payout destination settings.
            </p>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 sd-page sd-page-y">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-3">
            <PersonalInfoSection
              profile={data.profile}
              verification={data.verification}
              onProfileChange={handleProfileChange}
              showLocation
              onAvatarUploaded={() => queryClient.invalidateQueries({ queryKey: ["seller-profile"] })}
            />
            <div id="identity"><SellerVerificationSection verification={data.verification} permissions={data.permissions} isLoading={isLoading} /></div>
            <div id="plan"><VendorPlanSection /></div>
            <SecuritySection />
            {displayPrefs && (
              <NotificationPreferencesSection
                preferences={displayPrefs}
                onToggle={handlePrefToggle}
              />
            )}
            <div id="payout">
              <PayoutDestinationSection
                payoutAccount={data.payout_account}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ["seller-profile"] })}
              />
            </div>
            {data.profile?.id && <EffectiveSettingsPanel vendorId={data.profile.id} />}
            <DangerZoneSection />

            {/* Save / Cancel */}
            <div className="flex items-center gap-4 pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!hasPending || saveMutation.isPending}
                className="px-8"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                variant="secondary"
                disabled={!hasPending}
                onClick={() => {
                  setPendingChanges({});
                  setPendingPrefs({});
                  refetch();
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-3">
              <TrustSafetyPanel />
              <AccountStatusCard
                accountMeta={data.account_meta}
                verification={data.verification}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SellerProfileSettings;
