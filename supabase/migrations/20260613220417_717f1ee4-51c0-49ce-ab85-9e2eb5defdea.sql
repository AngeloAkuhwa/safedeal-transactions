ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'suspend_user';
ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'unsuspend_user';
ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'clear_flag';
ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'add_note';