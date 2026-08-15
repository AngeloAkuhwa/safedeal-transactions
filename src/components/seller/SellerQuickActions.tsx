import { useNavigate, Link } from "react-router";
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
      href: "/seller/transactions?filter=draft",
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
      <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {actions.map((action, idx) => (
          <Card
            key={action.title}
            className={`sd-card sd-action relative cursor-pointer group h-full hover:-translate-y-0.5 transition-transform sd-fade-in-stagger sd-delay-${Math.min(idx + 1, 6)}`}
          >
            <CardContent className="p-4">
              <div className={`h-9 w-9 rounded-lg ${action.iconBg} flex items-center justify-center mb-2.5 transition-colors`}>
                <action.icon className={`h-[18px] w-[18px] ${action.iconColor} transition-colors`} />
              </div>
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors mb-0.5">
                {/* Stretched link: the real control keyboard users reach, sized
                    over the whole card so the mouse target is unchanged. */}
                <Link
                  to={action.href}
                  className="after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {action.title}
                </Link>
              </h3>
              <p className="text-xs text-muted-foreground leading-snug">{action.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
