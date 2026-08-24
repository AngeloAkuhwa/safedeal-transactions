import { Link } from "react-router";
import {
  PackageOpen,
  Truck,
  ClipboardCheck,
  Bell,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgreementNextStepsProps {
  transactionId: string;
}

export function AgreementNextSteps({ transactionId }: AgreementNextStepsProps) {
  const steps = [
    {
      icon: PackageOpen,
      title: "Seller Processing",
      description: "Seller prepares and ships your item according to locked terms",
    },
    {
      icon: Truck,
      title: "In Transit",
      description: "Track delivery progress with real-time updates",
    },
    {
      icon: ClipboardCheck,
      title: "Verify & Confirm",
      description: "Check item matches agreement and confirm or dispute",
    },
  ];

  const notifications = [
    "Seller marks the item as shipped",
    "Item is out for delivery",
    "Item has been delivered",
    "Verification window is about to expire",
  ];

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 lg:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
            <ArrowRight className="h-4 w-4 text-primary" />
            <span className="text-primary font-bold text-sm">What Happens Next</span>
          </div>
          <h2 className="h-page font-bold text-foreground mb-3">
            Track Your Transaction
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Monitor your order status in real-time and receive notifications at every step until
            delivery confirmation.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-8">
          {steps.map((step) => (
            <div key={step.title} className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <step.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="bg-muted/50 rounded-xl border border-border p-6 mb-8">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-foreground mb-2">You'll Be Notified When:</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {notifications.map((text) => (
                  <li key={text} className="flex items-center gap-2">
                    <Circle className="h-2 w-2 text-primary fill-primary shrink-0" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="text-center space-y-4">
          <Button asChild size="lg" className="text-lg px-10 py-6 rounded-xl font-bold shadow-lg">
            <Link to={`/dashboard/transactions/${transactionId}/verify`}>
              <BarChart3 className="h-5 w-5 mr-2" />
              View Transaction Tracking
              <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
          </Button>
          <div>
            <Button asChild variant="link" className="text-sm font-semibold">
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
