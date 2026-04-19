-- Batch 7: Delivery Confirmation Tokens

CREATE TYPE public.delivery_confirmation_token_status AS ENUM ('active', 'used', 'expired', 'revoked');

CREATE TABLE public.delivery_confirmation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  status public.delivery_confirmation_token_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_confirmation_tokens_transaction
  ON public.delivery_confirmation_tokens(transaction_id, status);

CREATE INDEX idx_delivery_confirmation_tokens_seller
  ON public.delivery_confirmation_tokens(seller_id, status);

ALTER TABLE public.delivery_confirmation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sellers_select_own_delivery_tokens"
  ON public.delivery_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

CREATE POLICY "buyers_select_own_delivery_tokens"
  ON public.delivery_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_id);

CREATE POLICY "admins_select_all_delivery_tokens"
  ON public.delivery_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

-- Inserts/updates happen exclusively via service_role in edge functions.