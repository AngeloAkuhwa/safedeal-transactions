
ALTER TABLE public.products ADD COLUMN original_price numeric;

UPDATE public.products SET original_price = round(unit_price * 1.18) WHERE original_price IS NULL AND unit_price IS NOT NULL;
