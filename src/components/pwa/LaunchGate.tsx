import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Loader2 } from "lucide-react";
import { getSession } from "@/services/auth.service";
import { getUserRoles } from "@/services/role.service";
import { isInternalUser } from "@/lib/internal-role";
import { isStandaloneLaunch, resolveLaunchTarget } from "@/pwa/launch-routing";

/**
 * Root-route gate. In a browser tab this renders the landing page untouched.
 * Only when the app is running as an installed PWA does it resolve the
 * session and send the user straight to their app home.
 */
export function LaunchGate({ children }: { children: React.ReactNode }) {
  // Evaluated once, synchronously, before first paint. No landing flash.
  const [standalone] = useState(() => isStandaloneLaunch());
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!standalone) return;
    let mounted = true;
    (async () => {
      try {
        const { data } = await getSession();
        const session = data?.session ?? null;
        if (!mounted) return;
        if (!session) {
          setTarget("/auth");
          return;
        }
        // Internal teammates first: they have no `user_roles` rows, and the
        // RPC behind `isInternalUser` denies suspended / expired accounts.
        const internal = await isInternalUser(session.user.id);
        if (!mounted) return;
        if (internal) {
          setTarget(resolveLaunchTarget(null, { internal: true }));
          return;
        }
        const { data: roles } = await getUserRoles(session.user.id);
        if (!mounted) return;
        setTarget(resolveLaunchTarget((roles ?? []).map((r) => r.role as string)));
      } catch {
        if (mounted) setTarget("/auth");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [standalone]);

  if (!standalone) return <>{children}</>;
  if (!target) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-background"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <span className="sr-only">Opening SafeDeal…</span>
      </div>
    );
  }
  return <Navigate to={target} replace />;
}