-- Add invalidated_at column to phone_otp_codes for audit clarity
-- Distinguishes: expired (time passed), invalidated (new code issued), verified (successfully used)
ALTER TABLE public.phone_otp_codes ADD COLUMN invalidated_at timestamptz;
