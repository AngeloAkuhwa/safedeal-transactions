import { LifeBuoy, MessageCircle } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supportLink } from "@/lib/support/support-copy";

export function DisputeSupportCard({ reference }: { reference?: string | null } = {}) {
  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-6 text-center space-y-3">
        <LifeBuoy className="mx-auto h-6 w-6 text-primary" />
        <h3 className="text-base font-bold text-foreground">Need Assistance?</h3>
        <p className="text-sm text-muted-foreground">
          Our support team is available to help you understand the dispute process.
        </p>
        <Button asChild variant="outline" size="sm" className="w-full gap-2">
          <Link to={supportLink(reference, "dispute")}>
            <MessageCircle className="h-4 w-4" />
            Contact support
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
