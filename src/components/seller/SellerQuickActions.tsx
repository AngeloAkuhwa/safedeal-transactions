import { Plus, FileText, BarChart3, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SellerQuickActionsProps {
  draftCount: number;
}

export function SellerQuickActions({ draftCount }: SellerQuickActionsProps) {
  const actions = [
    {
      icon: Plus,
      title: "Create Transaction",
      description: "Start a new protected deal",
      href: "/seller/transactions/new",
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      icon: FileText,
      title: "View Drafts",
      description: `${draftCount} draft${draftCount !== 1 ? "s" : ""} saved`,
      href: "/seller/transactions?filter=drafts",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      icon: BarChart3,
      title: "Sales Analytics",
      description: "View your performance",
      href: "/seller/analytics",
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
    {
      icon: Settings,
      title: "Account Settings",
      description: "Manage your profile",
      href: "/seller/profile",
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold text-foreground mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action) => (
          <Card
            key={action.title}
            className="hover:border-success/40 transition-all cursor-pointer group"
          >
            <CardContent className="p-5">
              <div className={`h-10 w-10 rounded-xl ${action.iconBg} flex items-center justify-center mb-3`}>
                <action.icon className={`h-5 w-5 ${action.iconColor}`} />
              </div>
              <h3 className="text-sm font-semibold text-foreground group-hover:text-success transition-colors">
                {action.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
