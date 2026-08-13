UPDATE public.transaction_links
SET expires_at = created_at + interval '14 days',
    updated_at = now()
WHERE is_active = true
  AND expires_at IS NULL;