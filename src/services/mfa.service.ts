// Decoupled MFA API layer. The only module that talks to the auth MFA client.
import { supabase } from "@/integrations/supabase/client";

export interface MfaFactor {
  id: string;
  status: "verified" | "unverified";
  friendly_name?: string;
}

export interface MfaStatus {
  has_verified_factor: boolean;
  unverified_factor_count: number;
  recovery_codes_total: number;
  recovery_codes_unused: number;
  recovery_codes_generated_at: string | null;
}

export const listFactors = async (): Promise<MfaFactor[]> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return ((data?.all ?? []) as MfaFactor[]).filter((f) => !!f.id);
};

/** Remove any half-finished factor left behind by an abandoned enrolment. */
export const cleanUpUnverifiedFactors = async (): Promise<number> => {
  const factors = await listFactors();
  const stale = factors.filter((f) => f.status !== "verified");
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  return stale.length;
};

export const startEnrolment = async () => {
  await cleanUpUnverifiedFactors();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `SafeDeal ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
};

export const verifyFactor = async (factorId: string, code: string) => {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  // Defence-in-depth telemetry only: the code itself is never sent anywhere
  // other than the auth server.
  void supabase.functions.invoke("mfa-recovery", {
    body: { action: "log_totp_attempt", success: !error },
  });
  if (error) throw error;
  return true;
};

export const unenrol = async (factorId: string) => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
};

export const getAal = async () => {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
  };
};

export const getMfaStatus = async (): Promise<MfaStatus> => {
  const { data, error } = await supabase.functions.invoke("mfa-recovery", {
    body: { action: "status" },
  });
  if (error) throw error;
  return data as MfaStatus;
};

export const generateRecoveryCodes = async (): Promise<string[]> => {
  const { data, error } = await supabase.functions.invoke("mfa-recovery", {
    body: { action: "generate" },
  });
  if (error) throw error;
  return (data as { codes: string[] }).codes;
};

/** Consume a recovery code. Works at aal1 by design (see the edge function). */
export const consumeRecoveryCode = async (code: string) => {
  const { data, error } = await supabase.functions.invoke("mfa-recovery", {
    body: { action: "consume", code },
  });
  if (error) throw error;
  return data as { ok: boolean; factors_removed: number };
};

export const adminUnenrolUser = async (userId: string, reason: string) => {
  const { data, error } = await supabase.functions.invoke("admin-mfa-unenrol", {
    body: { user_id: userId, reason },
  });
  if (error) throw error;
  return data as { ok: boolean; factors_removed: number };
};