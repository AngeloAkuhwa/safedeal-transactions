-- Extend agent availability enum with on_leave and suspended
ALTER TYPE public.agent_availability_status ADD VALUE IF NOT EXISTS 'on_leave';
ALTER TYPE public.agent_availability_status ADD VALUE IF NOT EXISTS 'suspended';