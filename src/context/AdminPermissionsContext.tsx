import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { permissionForPath } from "@/services/admin-route-permissions";

interface AdminMePayload {
  user_id: string;
  email: string | null;
  roles: string[];
  permissions: string[]; // may contain "*" sentinel for super
  access_level: string;
  is_super: boolean;
}

interface AdminPermissionsValue {
  loading: boolean;
  error: string | null;
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
      const { data: resp, error: fnErr } = await supabase.functions.invoke("admin-me");
      if (fnErr) {
        const status = "context" in fnErr && fnErr.context instanceof Response ? ` (${fnErr.context.status})` : "";
        throw new Error(`${fnErr.message}${status}`);
      }
      setData(resp as AdminMePayload);
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
    // Safe fallback so components outside the provider don't crash — they
    // simply get "no access". This only fires in tests/storybook contexts.
    return {
      loading: false,
      error: null,
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
