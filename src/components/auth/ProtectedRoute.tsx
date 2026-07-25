import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { getSession, onAuthStateChange } from "@/services/auth.service";
import { getUserRoles } from "@/services/role.service";
import { isInternalUser } from "@/lib/internal-role";
import BrandedAuthSplash from "./BrandedAuthSplash";

interface ProtectedRouteProps {
  requireRole?: string | boolean;
}

const ProtectedRoute = ({ requireRole = false }: ProtectedRouteProps) => {
  const location = useLocation();
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated" | "needs-role" | "wrong-role"
  >("loading");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isInternal, setIsInternal] = useState(false);

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

        const roleNames = (roles ?? []).map((r) => r.role as string);
        setUserRoles(roleNames);

        if (roleNames.length === 0) {
          // Internal (back-office) teammates don't have rows in `user_roles`;
          // their access comes from `internal_user_roles`. Never send them
          // through the Buyer/Seller picker.
          const internal = await isInternalUser(session.user.id);
          if (!mounted) return;
          if (internal) {
            setIsInternal(true);
            setStatus("wrong-role");
            return;
          }
          setStatus("needs-role");
          return;
        }

        if (typeof requireRole === "string") {
          if (!roleNames.includes(requireRole)) {
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
    return <BrandedAuthSplash />;
  }

  const currentPath = encodeURIComponent(location.pathname + location.search);

  if (status === "unauthenticated") {
    return <Navigate to={`/auth?mode=login&redirect=${currentPath}`} replace />;
  }

  if (status === "needs-role") {
    return <Navigate to={`/role-selection?redirect=${currentPath}`} replace />;
  }

  if (status === "wrong-role") {
    // Internal team members always belong in the admin workspace.
    if (isInternal) {
      return <Navigate to="/admin/dashboard" replace />;
    }
    // Admins always go to admin dashboard, regardless of which non-admin route they tried.
    if (userRoles.includes("admin")) {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (userRoles.includes("buyer")) {
      return <Navigate to="/dashboard" replace />;
    }
    if (userRoles.includes("seller")) {
      return <Navigate to="/seller" replace />;
    }
    return <Navigate to="/role-selection" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
