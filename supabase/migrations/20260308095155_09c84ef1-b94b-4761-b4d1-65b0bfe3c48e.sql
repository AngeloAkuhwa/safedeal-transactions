
-- Fix security definer views by setting them to SECURITY INVOKER
ALTER VIEW public.buyer_transactions_view SET (security_invoker = on);
ALTER VIEW public.seller_transactions_view SET (security_invoker = on);
ALTER VIEW public.admin_dispute_summary_view SET (security_invoker = on);
