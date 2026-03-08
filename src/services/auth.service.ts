import { supabase } from "@/integrations/supabase/client";

export const signIn = async (email: string, password: string) => {
  return supabase.auth.signInWithPassword({ email, password });
};

export const signUp = async (
  email: string,
  password: string,
  metadata: Record<string, string>
) => {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
};

export const signOut = async () => {
  return supabase.auth.signOut();
};

export const getSession = async () => {
  return supabase.auth.getSession();
};

export const onAuthStateChange = (
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) => {
  return supabase.auth.onAuthStateChange(callback);
};

export const resendVerificationEmail = async (email: string) => {
  return supabase.auth.resend({ type: "signup", email });
};

export const resetPasswordForEmail = async (
  email: string,
  redirectTo: string
) => {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
};

export const updatePassword = async (password: string) => {
  return supabase.auth.updateUser({ password });
};
