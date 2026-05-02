import { useNavigate } from "react-router-dom";
import { Plus, FileText, BarChart3, Settings, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SellerQuickActionsProps {
  draftCount: number;
}

export function SellerQuickActions({ draftCount }: SellerQuickActionsProps) {
  const navigate = useNavigate();
  const actions = [
    {
      icon: Plus,
      title: "Create Transaction",
      description: "Start a new protected deal with a buyer",
      href: "/seller/transactions/new",
      iconBg: "bg-success/10 group-hover:bg-success",
      iconColor: "text-success group-hover:text-white",
    },
    {
      icon: Store,
      title: "Add Product",
      description: "Create a new product listing for your storefront",
      href: "/seller/storefront/new",
      iconBg: "bg-primary/10 group-hover:bg-primary",
      iconColor: "text-primary group-hover:text-white",
    },
    {
      icon: FileText,
      title: "View Drafts",
      description: `${draftCount} draft${draftCount !== 1 ? "s" : ""} saved and ready to send`,
      href: "/seller/transactions?filter=drafts",
      iconBg: "bg-primary/10 group-hover:bg-primary",
      iconColor: "text-primary group-hover:text-white",
    },
    {
      icon: BarChart3,
      title: "Sales Analytics",
      description: "View your sales performance and trends",
      href: "/seller/analytics",
      iconBg: "bg-warning/10 group-hover:bg-warning",
      iconColor: "text-warning group-hover:text-white",
    },
    {
      icon: Settings,
      title: "Account Settings",
      description: "Manage your profile and preferences",
      href: "/seller/profile",
      iconBg: "bg-muted group-hover:bg-foreground",
      iconColor: "text-muted-foreground group-hover:text-white",
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {actions.map((action) => (
          <Card
            key={action.title}
            className="rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer group h-full"
            onClick={() => navigate(action.href)}
          >
            <CardContent className="p-5">
              <div className={`h-11 w-11 rounded-xl ${action.iconBg} flex items-center justify-center mb-3 transition-colors`}>
                <action.icon className={`h-5 w-5 ${action.iconColor} transition-colors`} />
              </div>
              <h3 className="text-base font-bold text-foreground group-hover:text-success transition-colors mb-1">
                {action.title}
              </h3>
              <p className="text-sm text-muted-foreground">{action.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
