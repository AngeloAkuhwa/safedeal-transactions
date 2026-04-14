ALTER TABLE public.products ADD COLUMN feature_highlights jsonb DEFAULT '[]';
ALTER TABLE public.products ADD COLUMN delivery_scope text;
ALTER TABLE public.products ADD COLUMN estimated_delivery_days text;