import { Lock, ShieldCheck, UserCheck, BadgeCheck } from "lucide-react";

const items = [
  {
    icon: Lock,
    title: "Your data is secure",
    bullets: [
      "256-bit SSL encryption",
      "PCI DSS compliant",
      "Two-factor authentication",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Identity & Payment Verification",
    bullets: [
      "Verified buyer & seller identities",
      "Secure payment processing",
      "Fraud detection built-in",
    ],
  },
  {
    icon: UserCheck,
    title: "Choose Your Role After Signup",
    bullets: [
      "Select buyer or seller after account creation",
      "Switch roles anytime",
      "Role-specific dashboards",
    ],
  },
  {
    icon: BadgeCheck,
    title: "Account Verification",
    bullets: [
      "Email verification required",
      "Phone verification for payouts",
      "Identity checks for disputes",
    ],
  },
];

const SecurityReassurance = () => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-8">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-xl border bg-card p-4"
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <item.icon className="h-4 w-4" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              {item.title}
            </h4>
          </div>
          <ul className="space-y-1 pl-[2.625rem]">
            {item.bullets.map((bullet) => (
              <li key={bullet} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <span className="text-primary mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default SecurityReassurance;
