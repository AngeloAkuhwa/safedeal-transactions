import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getSession, onAuthStateChange } from "@/services/auth.service";
import { getUserRoles } from "@/services/role.service";

interface ProtectedRouteProps {
  requireRole?: string | boolean;
}

const ProtectedRoute = ({ requireRole = false }: ProtectedRouteProps) => {
  const location = useLocation();
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated" | "needs-role" | "wrong-role"
  >("loading");

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const { data: { session } } = await getSession();
      if (!mounted) return;

      if (!session) {
        setStatus("unauthenticated");
        return;
      }

      if (requireRole) {
        const { data: roles } = await getUserRoles(session.user.id);
        if (!mounted) return;

        if (!roles || roles.length === 0) {
          setStatus("needs-role");
          return;
        }

        // If a specific role string is required, check for it
        if (typeof requireRole === "string") {
          const hasSpecificRole = roles.some((r) => r.role === requireRole);
          if (!hasSpecificRole) {
            setStatus("wrong-role");
            return;
          }
        }
      }

      setStatus("authenticated");
    };

    const { data: { subscription } } = onAuthStateChange(async (_event, session) => {
      if (!session) {
        setStatus("unauthenticated");
      }
    });

    check();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [requireRole]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentPath = encodeURIComponent(location.pathname + location.search);

  if (status === "unauthenticated") {
    return <Navigate to={`/auth?mode=login&redirect=${currentPath}`} replace />;
  }

  if (status === "needs-role") {
    return <Navigate to={`/role-selection?redirect=${currentPath}`} replace />;
  }

  if (status === "wrong-role") {
    return <Navigate to={`/role-selection?redirect=${currentPath}`} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
