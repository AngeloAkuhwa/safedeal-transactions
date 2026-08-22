import { useEffect, useState } from "react";
import { KeyRound, Smartphone, Monitor, Bell, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { changePassword } from "@/services/profile.service";
import { toast } from "@/components/ui/sonner";
import { TwoFactorDialog } from "@/components/security/TwoFactorDialog";
import { getMfaStatus } from "@/services/mfa.service";

export function SecuritySection() {
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  // Real derived state from the auth factor list. No hardcoded badge.
  const [twoFa, setTwoFa] = useState<{ enabled: boolean; unused: number } | null>(null);

  const loadTwoFa = async () => {
    try {
      const s = await getMfaStatus();
      setTwoFa({ enabled: s.has_verified_factor, unused: s.recovery_codes_unused });
    } catch {
      setTwoFa(null);
    }
  };

  useEffect(() => { loadTwoFa(); }, []);

  const handleChangePassword = async () => {
    if (newPwd.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await changePassword(newPwd);
      toast.success("Password changed successfully");
      setPwdOpen(false);
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const securityItems = [
    {
      icon: KeyRound,
      label: "Change Password",
      description: "Last changed 3 months ago",
      action: () => setPwdOpen(true),
      trailing: "chevron" as const,
    },
    {
      icon: Smartphone,
      label: "Two-Factor Authentication",
      description: twoFa?.enabled
        ? `Authenticator app active · ${twoFa.unused} recovery codes left`
        : "Add an extra layer of security",
      badge: twoFa === null ? "…" : twoFa.enabled ? "Enabled" : "Disabled",
      action: () => setTwoFaOpen(true),
      trailing: "chevron" as const,
    },
    {
      icon: Monitor,
      label: "Login Sessions",
      description: "Manage active devices and sessions",
      trailing: "chevron" as const,
    },
    {
      icon: Bell,
      label: "Security Alerts",
      description: "Get notified of suspicious activity",
      trailing: "toggle" as const,
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {securityItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              disabled={!item.action}
              className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {item.badge && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {item.badge}
                  </Badge>
                )}
                {item.trailing === "chevron" && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                {item.trailing === "toggle" && (
                  <Switch
                    checked={securityAlerts}
                    onCheckedChange={(checked) => {
                      setSecurityAlerts(checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <TwoFactorDialog open={twoFaOpen} onOpenChange={setTwoFaOpen} onChanged={loadTwoFa} />

      {/* Change Password Dialog */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter your new password below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="newPwd">New Password</Label>
              <Input
                id="newPwd"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Min 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPwd">Confirm Password</Label>
              <Input
                id="confirmPwd"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={loading}>
              {loading ? "Saving…" : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
