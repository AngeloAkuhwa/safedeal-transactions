import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface AuthContext {
  userId: string;
  email: string | null;
  adminClient: SupabaseClient;
}

/**
 * Resolve the calling user from the Authorization bearer token, returning
 * a service-role client and the user identity. Throws on auth failure.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError(401, "not_authenticated");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) throw new AuthError(401, "invalid_session");
  return { userId: data.user.id, email: data.user.email ?? null, adminClient };
}

/**
 * Resolve the caller and assert they have the `admin` role.
 * Internal helper for back-office release / refund / queue endpoints.
 */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  const ctx = await requireUser(req);
  const { data: hasRole, error } = await ctx.adminClient.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new AuthError(500, "role_check_failed");
  if (!hasRole) throw new AuthError(403, "admin_required");
  return ctx;
}

export class AuthError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export function authErrorResponse(err: unknown, corsHeaders: Record<string, string>): Response | null {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.code }), {
      status: err.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}