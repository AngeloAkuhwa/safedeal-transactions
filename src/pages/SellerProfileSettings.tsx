import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, UserCog, X, Save } from "lucide-react";
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
import {
  getSellerProfile,
  updateSellerProfile,
  updateSellerPreferences,
  type SellerProfile,
  type NotificationPreferences,
} from "@/services/seller-profile.service";
import { toast } from "@/components/ui/sonner";

const SellerProfileSettings = () => {
  const queryClient = useQueryClient();

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
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
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={data.profile.full_name} avatarUrl={data.profile.avatar_url} />

      {/* Hero */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserCog className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Profile & Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage your account, verification status, security, notifications, and payout destination settings.
            </p>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <PersonalInfoSection
              profile={data.profile}
              verification={data.verification}
              onProfileChange={handleProfileChange}
              showLocation
              onAvatarUploaded={() => queryClient.invalidateQueries({ queryKey: ["seller-profile"] })}
            />
            <SellerVerificationSection verification={data.verification} permissions={data.permissions} isLoading={isLoading} />
            <SecuritySection />
            {displayPrefs && (
              <NotificationPreferencesSection
                preferences={displayPrefs}
                onToggle={handlePrefToggle}
              />
            )}
            <PayoutDestinationSection
              payoutAccount={data.payout_account}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["seller-profile"] })}
            />
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
            <div className="sticky top-24 space-y-6">
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
