import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shield, ShoppingBag, Store, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Role = "buyer" | "seller";

const RoleSelection = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth?mode=login", { replace: true });
        return;
      }
      if (!session.user.email_confirmed_at) {
        navigate("/auth", { replace: true });
        return;
      }

      // Pre-select based on existing default_role
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_role")
        .eq("id", session.user.id)
        .single();

      if (profile?.default_role && (profile.default_role === "buyer" || profile.default_role === "seller")) {
        setSelectedRole(profile.default_role as Role);
      }
      setLoading(false);
    };
    check();
  }, [navigate]);

  const handleContinue = async () => {
    if (!selectedRole) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth?mode=login", { replace: true });
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ default_role: selectedRole })
        .eq("id", session.user.id);

      if (error) {
        toast.error("Could not save your role. Please try again.");
        return;
      }

      toast.success(`Continuing as ${selectedRole === "buyer" ? "Buyer" : "Seller"}`);
      navigate("/dashboard", { replace: true });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const roles = [
    {
      id: "buyer" as Role,
      title: "Continue as Buyer",
      description: "Browse and purchase items with escrow protection",
      icon: ShoppingBag,
    },
    {
      id: "seller" as Role,
      title: "Continue as Seller",
      description: "List items and receive secure payments",
      icon: Store,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5 flex flex-col">
      {/* Header */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between max-w-lg mx-auto w-full">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">SafeDeal</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              How would you like to use SafeDeal?
            </h1>
            <p className="text-muted-foreground text-sm">
              You can always switch roles later from your settings.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {roles.map((role) => {
              const Icon = role.icon;
              const isSelected = selectedRole === role.id;
              return (
                <Card
                  key={role.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isSelected
                      ? "ring-2 ring-primary border-primary bg-primary/5"
                      : "hover:border-primary/50"
                  )}
                  onClick={() => setSelectedRole(role.id)}
                >
                  <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                    <div
                      className={cn(
                        "h-14 w-14 rounded-full flex items-center justify-center transition-colors",
                        isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">{role.title}</h2>
                      <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!selectedRole || submitting}
            onClick={handleContinue}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
