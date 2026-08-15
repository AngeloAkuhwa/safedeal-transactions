import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserCog, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { PersonalInfoSection } from "@/components/profile/PersonalInfoSection";
import { AccountVerificationSection } from "@/components/profile/AccountVerificationSection";
import { SecuritySection } from "@/components/profile/SecuritySection";
import { NotificationPreferencesSection } from "@/components/profile/NotificationPreferencesSection";
import { DangerZoneSection } from "@/components/profile/DangerZoneSection";
import { TrustSafetyPanel } from "@/components/profile/TrustSafetyPanel";
import { PhoneVerificationModal } from "@/components/profile/PhoneVerificationModal";
import {
  getBuyerProfile,
  updateProfile,
  updateNotificationPreferences,
  type BuyerProfile,
  type NotificationPreferences,
} from "@/services/profile.service";
import { toast } from "@/components/ui/sonner";
import { PageSkeleton } from "@/components/common/PageSkeleton";

const BuyerProfileSettings = () => {
  const queryClient = useQueryClient();
  const location = useLocation();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    retry: 1,
    staleTime: 30_000,
  });

  // Scroll to a section referenced via URL hash (e.g. #location) once data has loaded.
  useEffect(() => {
    if (!location.hash || isLoading || !data) return;
    const id = location.hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, isLoading, data]);

  // Track pending profile edits
  const [pendingChanges, setPendingChanges] = useState<Partial<BuyerProfile>>({});
  // Track pending notification preference edits
  const [pendingPrefs, setPendingPrefs] = useState<Partial<NotificationPreferences>>({});
  // Phone verification modal
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  const hasPendingProfile = Object.keys(pendingChanges).length > 0;
  const hasPendingPrefs = Object.keys(pendingPrefs).length > 0;
  const hasPending = hasPendingProfile || hasPendingPrefs;

  const handleProfileChange = useCallback((updates: Partial<BuyerProfile>) => {
    setPendingChanges((prev) => ({ ...prev, ...updates }));
  }, []);

  const handlePrefToggle = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      setPendingPrefs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Save profile + preferences in one action
  const saveMutation = useMutation({
    mutationFn: async () => {
      const promises: Promise<unknown>[] = [];

      if (hasPendingProfile) {
        promises.push(
          updateProfile({
            full_name: pendingChanges.full_name,
            phone: pendingChanges.phone ?? undefined,
            country_code: pendingChanges.country_code,
            state_name: (pendingChanges as Record<string, unknown>).state_name as string | undefined,
            city_name: (pendingChanges as Record<string, unknown>).city_name as string | undefined,
          })
        );
      }

      if (hasPendingPrefs) {
        promises.push(updateNotificationPreferences(pendingPrefs));
      }

      await Promise.all(promises);
    },
    onSuccess: () => {
      toast.success("Settings saved successfully");
      setPendingChanges({});
      setPendingPrefs({});
      queryClient.invalidateQueries({ queryKey: ["buyer-profile"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Merge server preferences with pending local changes for display
  const displayPrefs: NotificationPreferences | undefined = data?.preferences
    ? { ...data.preferences, ...pendingPrefs }
    : undefined;

  // ── Loading state ──
  if (isLoading) {
    return (
      <PageSkeleton label="Loading your profile settings" />
    );
  }

  // ── Error state ──
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

  const hasLocation = !!(data.profile.state_name && data.profile.city_name);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <BuyerNav buyerName={data.profile.full_name} avatarUrl={data.profile.avatar_url} />

      {/* Compact header */}
      <section className="border-b bg-card/50">
        <div className="sd-page sd-page-y flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserCog className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="sd-page-title">Profile & Settings</h1>
            <p className="sd-page-sub">
              Manage your account, verification details, security, and transaction preferences
            </p>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 sd-page sd-page-y">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <PersonalInfoSection
              profile={data.profile}
              verification={data.verification}
              onProfileChange={handleProfileChange}
              showLocation
            />
            <AccountVerificationSection
              verification={data.verification}
              permissions={data.permissions}
              hasLocation={hasLocation}
              isLoading={isLoading}
              onPhoneVerifyClick={() => setShowPhoneModal(true)}
              identitySubmissionStatus={data.identity_submission?.status ?? null}
            />
            <SecuritySection />
            {displayPrefs && (
              <NotificationPreferencesSection
                preferences={displayPrefs}
                onToggle={handlePrefToggle}
              />
            )}
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
            <div className="sticky top-24">
              <TrustSafetyPanel />
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Phone Verification Modal */}
      <PhoneVerificationModal
        open={showPhoneModal}
        onOpenChange={setShowPhoneModal}
        currentPhone={data.profile.phone}
      />
    </div>
  );
};

export default BuyerProfileSettings;
