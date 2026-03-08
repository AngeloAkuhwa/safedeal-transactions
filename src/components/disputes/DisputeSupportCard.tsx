import { LifeBuoy, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DisputeSupportCard() {
  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-6 text-center space-y-3">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <LifeBuoy className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-base font-bold text-foreground">Need Assistance?</h3>
        <p className="text-sm text-muted-foreground">
          Our support team is available to help you understand the dispute process.
        </p>
        <Button variant="outline" size="sm" className="w-full gap-2" disabled>
          <MessageCircle className="h-4 w-4" />
          Chat with Support
        </Button>
      </CardContent>
    </Card>
  );
}
