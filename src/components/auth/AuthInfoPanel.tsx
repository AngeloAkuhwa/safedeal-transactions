import { Shield, Lock, Zap, Headphones } from "lucide-react";
import { Link } from "react-router";

const features = [
  {
    icon: Lock,
    title: "Account Security",
    description: "Encrypted connections and account security controls",
  },
  {
    icon: Zap,
    title: "Recorded Payment States",
    description: "Payment, release, refund, and dispute states are shown on each transaction",
  },
  {
    icon: Headphones,
    title: "Dedicated Support",
    description: "Our team is available to help resolve any transaction issues",
  },
];

const AuthInfoPanel = () => {
  return (
    <div className="hidden lg:flex flex-col justify-between bg-primary/5 dark:bg-primary/10 p-10 xl:p-14 rounded-l-2xl">
      <div>
        <Link to="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity min-h-11">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">SafeDeal</span>
        </Link>

        <h2 className="text-3xl font-bold text-foreground mb-3">
          Join SafeDeal
        </h2>
        <p className="text-muted-foreground mb-10 text-base leading-relaxed">
          Create your account to record buying and selling terms in one transaction flow.
        </p>

        <div className="space-y-6">
          {features.map((feature) => (
            <div key={feature.title} className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default AuthInfoPanel;
