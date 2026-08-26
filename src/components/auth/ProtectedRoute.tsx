import { useCallback, useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router";
import { getSession, onAuthStateChange } from "@/services/auth.service";
import { getUserRoles } from "@/services/role.service";
import { isInternalUser } from "@/lib/internal-role";
import { resilientAuthCall, markAuthHealthy } from "@/lib/auth-resilience";
import BrandedAuthSplash from "./BrandedAuthSplash";
import AuthUnavailable from "./AuthUnavailable";

interface ProtectedRouteProps {
  requireRole?: string | boolean;
}

/**
 * The gate, and the reason it now has a fifth state.
 *
 * The role lookup used to discard its error: `const { data: roles } = await
 * getUserRoles(...)` then `roles ?? []`. A transient failure therefore read as
 * "this person holds no roles", and the very next branch sent them to the role
 * picker. During the 2026-08-24 and 2026-08-25 auth degradations, that is an
 * established seller being shown a first-run screen and invited to pick a role
 * they already have.
 *
 * A lookup that did not answer is not an answer. `unavailable` holds the
 * person where they are and offers a retry, instead of navigating them
 * somewhere on the strength of something the server never said.
 */
const ProtectedRoute = ({ requireRole = false }: ProtectedRouteProps) => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith("/admin");
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated" | "needs-role" | "wrong-role" | "unavailable"
  >("loading");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

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
        const rolesOutcome = await resilientAuthCall("protected_route.user_roles", () =>
          getUserRoles(session.user.id),
        );
        if (!mounted) return;

        if (rolesOutcome.kind === "unavailable") {
          setStatus("unavailable");
          return;
        }
        // A `denied` here is RLS refusing the read, which for this table means
        // the caller genuinely cannot see roles. Treated as no roles, which is
        // what it is, rather than as an outage.
        const roleNames =
          rolesOutcome.kind === "ok"
            ? ((rolesOutcome.value ?? []) as { role: string }[]).map((r) => r.role)
            : [];
        markAuthHealthy();
        setUserRoles(roleNames);

        if (roleNames.length === 0) {
          // Internal (back-office) teammates don't have rows in `user_roles`;
          // their access comes from `internal_user_roles`. Never send them
          // through the Buyer/Seller picker.
          const internalOutcome = await resilientAuthCall("protected_route.internal_role", () =>
            isInternalUser(session.user.id),
          );
          if (!mounted) return;
          if (internalOutcome.kind === "unavailable") {
            // This is the branch that used to end at the role picker. Both
            // lookups failing is exactly the incident's shape, and picking a
            // role from here would write a row the person did not need.
            setStatus("unavailable");
            return;
          }
          const internal = internalOutcome.kind === "ok" && internalOutcome.value === true;
          if (internal) {
            setIsInternal(true);
            setStatus(requireRole === "admin" && isAdminPath ? "authenticated" : "wrong-role");
            return;
          }
          setStatus("needs-role");
          return;
        }

        if (typeof requireRole === "string") {
          if (!roleNames.includes(requireRole)) {
            if (requireRole === "admin" && isAdminPath) {
              const internalOutcome = await resilientAuthCall("protected_route.internal_role", () =>
                isInternalUser(session.user.id),
              );
              if (!mounted) return;
              if (internalOutcome.kind === "unavailable") {
                setStatus("unavailable");
                return;
              }
              if (internalOutcome.kind === "ok" && internalOutcome.value === true) {
                setIsInternal(true);
                setStatus("authenticated");
                return;
              }
            }
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
  }, [requireRole, isAdminPath, attempt]);

  if (status === "loading") {
    return <BrandedAuthSplash />;
  }

  if (status === "unavailable") {
    return <AuthUnavailable onRetry={retry} />;
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
      if (isAdminPath) {
        return <Outlet />;
      }
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
