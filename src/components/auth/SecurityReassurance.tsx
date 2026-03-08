import { Lock, ShieldCheck, UserCheck } from "lucide-react";

const items = [
  {
    icon: Lock,
    title: "Your data is secure",
    description:
      "We use bank-level encryption to protect your personal information and payment data.",
  },
  {
    icon: ShieldCheck,
    title: "Identity & Payment Verification",
    description:
      "SafeDeal uses identity and payment verification to protect both buyers and sellers.",
  },
  {
    icon: UserCheck,
    title: "Choose Your Role After Signup",
    description:
      "After creating your account, you'll select whether to continue as a buyer or seller.",
  },
];

const SecurityReassurance = () => {
  return (
    <div className="grid gap-4 sm:grid-cols-3 mt-8">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-xl border bg-card p-4 text-center"
        >
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <item.icon className="h-4 w-4" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1">
            {item.title}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
};

export default SecurityReassurance;
