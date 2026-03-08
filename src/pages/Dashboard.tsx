import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shield, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth?mode=login", { replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();
      setUserName(profile?.full_name || "User");
      setLoading(false);
    };
    check();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-16">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">SafeDeal</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">Welcome, {userName}!</h1>
        <p className="text-muted-foreground">Your dashboard is coming soon. This is a placeholder.</p>
      </main>
    </div>
  );
};

export default Dashboard;
