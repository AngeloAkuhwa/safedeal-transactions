import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { PersonalInfoSection } from "@/components/profile/PersonalInfoSection";
import { AccountVerificationSection } from "@/components/profile/AccountVerificationSection";
import { SecuritySection } from "@/components/profile/SecuritySection";
import { NotificationPreferencesSection } from "@/components/profile/NotificationPreferencesSection";
import { DangerZoneSection } from "@/components/profile/DangerZoneSection";
import { TrustSafetyPanel } from "@/components/profile/TrustSafetyPanel";
import {
  getBuyerProfile,
  updateProfile,
  updateNotificationPreferences,
  type BuyerProfile,
  type NotificationPreferences,
} from "@/services/profile.service";
import { toast } from "@/components/ui/sonner";

const BuyerProfileSettings = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    retry: 1,
    staleTime: 30_000,
  });

  // Track pending profile edits
  const [pendingChanges, setPendingChanges] = useState<Partial<BuyerProfile>>({});
  const hasPending = Object.keys(pendingChanges).length > 0;

  const handleProfileChange = useCallback((updates: Partial<BuyerProfile>) => {
    setPendingChanges((prev) => ({ ...prev, ...updates }));
  }, []);

  // Save profile mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        full_name: pendingChanges.full_name,
        phone: pendingChanges.phone ?? undefined,
        country_code: pendingChanges.country_code,
      }),
    onSuccess: () => {
      toast.success("Profile updated successfully");
      setPendingChanges({});
      queryClient.invalidateQueries({ queryKey: ["buyer-profile"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Notification toggle mutation
  const prefsMutation = useMutation({
    mutationFn: (prefs: Partial<NotificationPreferences>) =>
      updateNotificationPreferences(prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-profile"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handlePrefToggle = (key: keyof NotificationPreferences, value: boolean) => {
    prefsMutation.mutate({ [key]: value });
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Error state ──
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
      <BuyerNav buyerName={data.profile.full_name} avatarUrl={data.profile.avatar_url} />

      {/* Hero */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent py-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserCog className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Profile & Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage your account, verification details, security, and transaction preferences
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
            />
            <AccountVerificationSection verification={data.verification} />
            <SecuritySection />
            <NotificationPreferencesSection
              preferences={data.preferences}
              onToggle={handlePrefToggle}
            />
            <DangerZoneSection />

            {/* Save / Cancel */}
            <div className="flex items-center gap-4 pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!hasPending || saveMutation.isPending}
                className="px-8"
              >
                {saveMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                variant="ghost"
                disabled={!hasPending}
                onClick={() => {
                  setPendingChanges({});
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
    </div>
  );
};

export default BuyerProfileSettings;
