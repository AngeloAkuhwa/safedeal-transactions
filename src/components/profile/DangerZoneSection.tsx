import { Link } from "react-router";
import { supportLink } from "@/lib/support/support-copy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DangerZoneSection() {
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-xl">
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
          <Button asChild variant="outline" size="sm" className="text-muted-foreground">
            <Link to={supportLink(null, "account")}>Request deactivation</Link>
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-3">
          <div>
            <p className="text-sm font-medium text-destructive">Delete Account</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account and all data. This action cannot be undone.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="text-destructive border-destructive/30">
            <Link to={supportLink(null, "account")}>Request deletion</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
