-- 1. New edge_function_errors table for structured error logging
CREATE TABLE IF NOT EXISTS public.edge_function_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  user_id uuid NULL,
  error_code text NULL,
  message text NOT NULL,
  http_status integer NULL,
  request_context jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_function_errors_function_name 
  ON public.edge_function_errors(function_name);
CREATE INDEX IF NOT EXISTS idx_edge_function_errors_user_id 
  ON public.edge_function_errors(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_edge_function_errors_created_at 
  ON public.edge_function_errors(created_at DESC);

ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select_edge_function_errors"
  ON public.edge_function_errors
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

-- 2. Add confirmation_url to delivery_confirmation_tokens (persisted canonical URL)
ALTER TABLE public.delivery_confirmation_tokens
  ADD COLUMN IF NOT EXISTS confirmation_url text NULL;

-- 3. Backfill: set NULL on existing tokens so frontend re-derives with correct origin
UPDATE public.delivery_confirmation_tokens
  SET confirmation_url = NULL
  WHERE confirmation_url IS NOT NULL;