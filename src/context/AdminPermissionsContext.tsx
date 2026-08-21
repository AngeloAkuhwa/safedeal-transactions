import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { permissionForPath } from "@/services/admin-route-permissions";

interface AdminMePayload {
  user_id: string;
  email: string | null;
  full_name?: string | null;
  display_id?: string | null;
  roles: string[];
  permissions: string[]; // may contain "*" sentinel for super
  access_level: string;
  is_super: boolean;
}

interface AdminPermissionsValue {
  loading: boolean;
  error: string | null;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  roles: string[];
  permissions: string[];
  accessLevel: string;
  isSuper: boolean;
  has: (key: string) => boolean;
  hasAny: (keys: string[]) => boolean;
  canVisit: (pathname: string | null | undefined) => boolean;
  refresh: () => Promise<void>;
}

const AdminPermissionsContext = createContext<AdminPermissionsValue | null>(null);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function AdminPermissionsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AdminMePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use direct fetch instead of supabase.functions.invoke so 401/403
      // responses do not emit a console.error that the runtime tracker
      // misinterprets as a blank-screen crash.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        // No session: silently mark as unauthenticated; ProtectedRoute
        // will handle redirecting to /auth.
        setData(null);
        setError(null);
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-me`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || body?.error === "invalid_session") {
        // Stale/expired session: sign out cleanly so the auth guard can redirect.
        await supabase.auth.signOut().catch(() => {});
        setData(null);
        setError(null);
        return;
      }
      if (!res.ok) {
        throw new Error(body?.error || `admin-me failed (${res.status})`);
      }
      setData(body as AdminMePayload);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Could not load admin permissions.");
      setData((current) => current);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current > REFRESH_INTERVAL_MS) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const value = useMemo<AdminPermissionsValue>(() => {
    const permissions = data?.permissions ?? [];
    const isSuper = !!data?.is_super || permissions.includes("*");
    const permSet = new Set(permissions);

    const has = (key: string) => isSuper || permSet.has(key);
    const hasAny = (keys: string[]) => isSuper || keys.some((k) => permSet.has(k));
    const canVisit = (pathname: string | null | undefined) => {
      const req = permissionForPath(pathname);
      if (!req) return true; // ungated route
      return has(req);
    };

    return {
      loading,
      error,
      userId: data?.user_id ?? null,
      email: data?.email ?? null,
      fullName: data?.full_name ?? null,
      roles: data?.roles ?? [],
      permissions,
      accessLevel: data?.access_level ?? "limited",
      isSuper,
      has,
      hasAny,
      canVisit,
      refresh: load,
    };
  }, [data, loading, error, load]);

  return (
    <AdminPermissionsContext.Provider value={value}>{children}</AdminPermissionsContext.Provider>
  );
}

export function useAdminPermissions(): AdminPermissionsValue {
  const ctx = useContext(AdminPermissionsContext);
  if (!ctx) {
    // Safe fallback so components outside the provider don't crash: they
    // simply get "no access". This only fires in tests/storybook contexts.
    return {
      loading: false,
      error: null,
      userId: null,
      email: null,
      fullName: null,
      roles: [],
      permissions: [],
      accessLevel: "limited",
      isSuper: false,
      has: () => false,
      hasAny: () => false,
      canVisit: () => false,
      refresh: async () => {},
    };
  }
  return ctx;
}
