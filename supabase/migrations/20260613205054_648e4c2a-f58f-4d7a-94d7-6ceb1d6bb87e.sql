INSERT INTO public.system_settings (setting_key, setting_value)
VALUES (
  'escrow_alert_thresholds',
  jsonb_build_object(
    'frozen_days', 30,
    'overdue_days', 5,
    'idle_days', 15,
    'high_value_amount', 1000000,
    'mismatch_min_delta', 0.01
  )
)
ON CONFLICT (setting_key) DO NOTHING;