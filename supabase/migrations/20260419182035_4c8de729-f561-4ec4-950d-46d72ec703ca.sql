INSERT INTO public.escrow_states (transaction_id, state, held_amount, released_amount, refunded_amount, frozen_amount)
SELECT 
  t.id,
  CASE 
    WHEN t.money_status = 'funds_held_in_escrow' THEN 'held'::escrow_state
    WHEN t.money_status = 'funds_released' THEN 'released'::escrow_state
    ELSE 'awaiting_payment'::escrow_state
  END,
  CASE WHEN t.money_status = 'funds_held_in_escrow' THEN COALESCE(p.buyer_total_amount, 0) ELSE 0 END,
  CASE WHEN t.money_status = 'funds_released' THEN COALESCE(p.buyer_total_amount, 0) ELSE 0 END,
  0,
  0
FROM public.transactions t
LEFT JOIN public.transaction_pricing p ON p.transaction_id = t.id
LEFT JOIN public.escrow_states e ON e.transaction_id = t.id
WHERE e.id IS NULL
  AND t.money_status IN ('funds_held_in_escrow', 'funds_released');