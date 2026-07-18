-- Add high_value_flag to admin_action_type enum for high-value transaction alerts
ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'high_value_flag';