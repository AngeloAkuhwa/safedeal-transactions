import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DangerZoneSection() {
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Danger Zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Deactivate Account</p>
            <p className="text-xs text-muted-foreground">
              Temporarily disable your account. You can reactivate it anytime.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled className="text-muted-foreground">
            Deactivate
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-3">
          <div>
            <p className="text-sm font-medium text-destructive">Delete Account</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account and all data. This action cannot be undone.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled className="text-destructive border-destructive/30">
            Delete Account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
