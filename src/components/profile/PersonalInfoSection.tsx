import { useState, useRef, useEffect, useCallback } from "react";
import { User, CheckCircle, Upload, Trash2, Loader2, MapPin, Navigation } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { BuyerProfile, ServiceableRegion } from "@/services/profile.service";
import { getServiceableRegions } from "@/services/profile.service";

interface MinimalVerification {
  email_verified: boolean;
  phone_verified: boolean;
}

interface Props {
  profile: BuyerProfile & { state_name?: string | null; city_name?: string | null };
  verification: MinimalVerification;
  onProfileChange: (updates: Record<string, unknown>) => void;
  showLocation?: boolean;
  onAvatarUploaded?: (url: string | null) => void;
}

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function PersonalInfoSection({ profile, verification, onProfileChange, showLocation, onAvatarUploaded }: Props) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [stateName, setStateName] = useState(profile.state_name ?? "");
  const [cityName, setCityName] = useState(profile.city_name ?? "");

  const [regions, setRegions] = useState<ServiceableRegion[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayAvatarUrl = previewUrl ?? profile.avatar_url ?? undefined;

  const initials = profile.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Fetch regions on mount
  useEffect(() => {
    if (!showLocation) return;
    setRegionsLoading(true);
    getServiceableRegions()
      .then(setRegions)
      .catch(() => toast.error("Failed to load regions"))
      .finally(() => setRegionsLoading(false));
  }, [showLocation]);

  // Derived data
  const states = [...new Set(regions.map((r) => r.state_name))].sort();
  const lgasForState = regions.filter(
    (r) => r.state_name === stateName && r.city_name !== null
  );
  const isLagos = stateName === "Lagos";
  const isNonLagosState = stateName && !isLagos;

  const handleStateChange = useCallback(
    (value: string) => {
      setStateName(value);
      setCityName("");
      onProfileChange({ state_name: value || null, city_name: null });
    },
    [onProfileChange]
  );

  const handleLgaChange = useCallback(
    (value: string) => {
      setCityName(value);
      onProfileChange({ city_name: value || null });
    },
    [onProfileChange]
  );

  // Geolocation detect (convenience helper only. Never determines eligibility)
  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setDetectingLocation(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude, longitude } = pos.coords;

      // Reverse geocode via Nominatim (free, no API key)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const geo = await res.json();
      const detectedState = geo?.address?.state || "";

      // Try to match to a known state
      const matchedState = states.find(
        (s) => s.toLowerCase() === detectedState.toLowerCase()
      );

      if (matchedState) {
        handleStateChange(matchedState);
        toast.info(`Detected: ${matchedState}. Please confirm and select your LGA.`);
      } else {
        toast.info("Could not match your location to a known state. Please select manually.");
      }
    } catch {
      toast.error("Unable to detect your location. Please select manually.");
    } finally {
      setDetectingLocation(false);
    }
  }, [states, handleStateChange]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = "";

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Please select a JPG, PNG, GIF, or WebP image.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 2MB.");
      return;
    }

    // Instant local preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Get Cloudinary signature
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const signRes = await supabase.functions.invoke("upload-avatar", {
        body: { action: "sign_upload" },
      });
      if (signRes.error || !signRes.data) throw new Error("Failed to get upload signature");

      const { timestamp, signature, api_key, cloud_name, public_id } = signRes.data;

      // 2. Upload to Cloudinary with progress via XHR
      const avatarUrl = await new Promise<string>((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", api_key);
        formData.append("timestamp", String(timestamp));
        formData.append("signature", signature);
        formData.append("public_id", "avatar");
        formData.append("overwrite", "true");
        formData.append("invalidate", "true");
        formData.append("folder", signRes.data.folder);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const res = JSON.parse(xhr.responseText);
            resolve(res.secure_url);
          } else {
            reject(new Error("Cloudinary upload failed"));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
      });

      // 3. Save avatar URL to profile via edge function
      const saveRes = await supabase.functions.invoke("upload-avatar", {
        body: {
          action: "save_avatar",
          secure_url: avatarUrl,
          public_id,
        },
      });

      if (saveRes.error) throw new Error("Failed to save avatar");

      const finalUrl = saveRes.data.avatar_url;
      setPreviewUrl(finalUrl);
      toast.success("Profile photo updated!");
      onAvatarUploaded?.(finalUrl);
    } catch (err) {
      console.error("Avatar upload error:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
      // Revert preview on failure
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      URL.revokeObjectURL(localUrl);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const removeRes = await supabase.functions.invoke("upload-avatar", {
        body: { action: "remove_avatar" },
      });
      if (removeRes.error) throw new Error("Failed to remove avatar");

      setPreviewUrl(null);
      toast.success("Profile photo removed");
      onAvatarUploaded?.(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <User className="h-5 w-5 text-primary" />
          Personal Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar section */}
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20 rounded-2xl">
              <AvatarImage src={displayAvatarUrl} alt={profile.full_name} className="rounded-2xl object-cover" />
              <AvatarFallback className="text-lg rounded-2xl">{initials}</AvatarFallback>
            </Avatar>
            {isUploading && (
              <div className="absolute inset-0 bg-background/60 rounded-2xl flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="space-y-1 flex-1">
            <p className="text-sm font-medium text-foreground">Profile Photo</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF or WebP. Max size 2MB.</p>
            {uploadProgress !== null && (
              <Progress value={uploadProgress} className="h-2 w-full max-w-[200px]" />
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                {isUploading ? "Uploading…" : "Upload New Photo"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isUploading || isRemoving || (!profile.avatar_url && !previewUrl)}
                onClick={handleRemove}
              >
                {isRemoving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                Remove
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        <Separator />

        {/* Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                onProfileChange({ full_name: e.target.value });
              }}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Input id="email" value={profile.email} readOnly className="pr-10 bg-muted/50 rounded-xl" />
              {verification.email_verified && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <div className="relative">
            <Input
              id="phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                onProfileChange({ phone: e.target.value });
              }}
              className="pr-10 rounded-xl"
            />
            {verification.phone_verified && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
            )}
          </div>
        </div>

        {showLocation && (
          <>
            <Separator />
            <div id="location" className="space-y-4 scroll-mt-24">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <Label className="text-base font-semibold">Location</Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={detectLocation}
                  disabled={detectingLocation || regionsLoading}
                  className="text-xs text-primary"
                >
                  {detectingLocation ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Navigation className="h-3.5 w-3.5 mr-1" />
                  )}
                  Detect my location
                </Button>
              </div>

              <p className="text-xs text-muted-foreground -mt-2">
                Location detection only prefills values. You must confirm before saving.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stateName">State</Label>
                  <Select
                    value={stateName}
                    onValueChange={handleStateChange}
                    disabled={regionsLoading}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={regionsLoading ? "Loading states…" : "Select state"} />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isLagos && (
                  <div className="space-y-2">
                    <Label htmlFor="lgaName">Local Government Area (LGA)</Label>
                    <Select
                      value={cityName}
                      onValueChange={handleLgaChange}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select LGA" />
                      </SelectTrigger>
                      <SelectContent>
                        {lgasForState.map((r) => (
                          <SelectItem key={r.id} value={r.city_name!}>
                            {r.city_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {isNonLagosState && (
                <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Lagos-only launch</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        SafeDeal protected transactions are currently available only in Lagos during this launch phase.
                        You can complete your profile, and we'll notify you when your area becomes active.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isLagos && cityName && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Lagos: Eligible for protected transactions
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
