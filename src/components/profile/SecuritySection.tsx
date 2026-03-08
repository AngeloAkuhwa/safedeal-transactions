import { useState } from "react";
import { Lock, KeyRound, Smartphone, Monitor, Bell, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function SecuritySection() {
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);

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
      actionType: "chevron" as const,
    },
    {
      icon: Smartphone,
      label: "Two-Factor Authentication",
      description: "Add an extra layer of security",
      badge: "Disabled",
      actionType: "chevron" as const,
    },
    {
      icon: Monitor,
      label: "Login Sessions",
      description: "Manage active devices and sessions",
      actionType: "chevron" as const,
    },
    {
      icon: Bell,
      label: "Security Alerts",
      description: "Get notified of suspicious activity",
      actionType: "none" as const,
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lock className="h-5 w-5 text-destructive" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {securityItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              disabled={!item.action}
              className="w-full flex items-center justify-between rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
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
                {item.actionType === "chevron" && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

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
