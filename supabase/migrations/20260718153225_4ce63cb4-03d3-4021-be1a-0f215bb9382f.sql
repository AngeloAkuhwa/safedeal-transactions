ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.notification_deliveries REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_deliveries;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;