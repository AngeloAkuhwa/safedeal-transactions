
-- ============================================================
-- SafeDeal Batch 9: Security, RLS Policies, Access Control,
--                    Helper Functions, Performance Views
-- ============================================================

-- ======================== SEQUENCE ===========================
CREATE SEQUENCE IF NOT EXISTS public.transaction_code_seq START 1;

-- ============================================================
-- Part 1 — Security Helper Functions
-- ============================================================

-- 1.1 is_transaction_party
CREATE OR REPLACE FUNCTION public.is_transaction_party(_user_id uuid, _transaction_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE id = _transaction_id
      AND (buyer_id = _user_id OR seller_id = _user_id OR created_by_user_id = _user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.transaction_participants
    WHERE transaction_id = _transaction_id
      AND user_id = _user_id
  )
$$;

-- 1.2 is_user_region_allowed
CREATE OR REPLACE FUNCTION public.is_user_region_allowed(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_region_eligible FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- 1.3 invalidate_old_sessions
CREATE OR REPLACE FUNCTION public.invalidate_old_sessions(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_sessions
  SET is_active = false,
      revoked_at = now(),
      revoke_reason = 'new_login'
  WHERE user_id = _user_id
    AND is_active = true;
$$;

-- 1.4 generate_transaction_code
CREATE OR REPLACE FUNCTION public.generate_transaction_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number integer;
BEGIN
  SELECT nextval('public.transaction_code_seq') INTO next_number;
  RETURN 'SD-' || to_char(now(), 'YYYY') || '-' || lpad(next_number::text, 6, '0');
END;
$$;

-- ============================================================
-- Part 2 — RLS Policies
-- ============================================================

-- PROFILES
CREATE POLICY "users_select_own_profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "admins_select_all_profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- USER_ROLES
CREATE POLICY "users_select_own_roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins_select_all_roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- DEVICES
CREATE POLICY "users_select_own_devices" ON public.devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_devices" ON public.devices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_delete_own_devices" ON public.devices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- USER_SESSIONS
CREATE POLICY "users_select_own_sessions" ON public.user_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_sessions" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_sessions" ON public.user_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ACCOUNT_VERIFICATIONS
CREATE POLICY "users_select_own_verification" ON public.account_verifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins_select_all_verifications" ON public.account_verifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_verifications" ON public.account_verifications FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- NOTIFICATION_PREFERENCES
CREATE POLICY "users_select_own_notif_prefs" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_notif_prefs" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_notif_prefs" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- NOTIFICATIONS
CREATE POLICY "users_select_own_notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SERVICEABLE_REGIONS
CREATE POLICY "authenticated_select_regions" ON public.serviceable_regions FOR SELECT TO authenticated USING (true);

-- TRANSACTIONS
CREATE POLICY "parties_select_transactions" ON public.transactions FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), id));
CREATE POLICY "admins_select_all_transactions" ON public.transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sellers_insert_transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id AND auth.uid() = created_by_user_id);
CREATE POLICY "parties_update_transactions" ON public.transactions FOR UPDATE TO authenticated USING (public.is_transaction_party(auth.uid(), id)) WITH CHECK (public.is_transaction_party(auth.uid(), id));

-- TRANSACTION_ITEMS
CREATE POLICY "parties_select_txn_items" ON public.transaction_items FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_txn_items" ON public.transaction_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));
CREATE POLICY "sellers_update_txn_items" ON public.transaction_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_PRICING
CREATE POLICY "parties_select_txn_pricing" ON public.transaction_pricing FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_txn_pricing" ON public.transaction_pricing FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));
CREATE POLICY "sellers_update_txn_pricing" ON public.transaction_pricing FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_DELIVERY_TERMS
CREATE POLICY "parties_select_delivery_terms" ON public.transaction_delivery_terms FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_delivery_terms" ON public.transaction_delivery_terms FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));
CREATE POLICY "sellers_update_delivery_terms" ON public.transaction_delivery_terms FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_NOTES
CREATE POLICY "parties_select_txn_notes" ON public.transaction_notes FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_txn_notes" ON public.transaction_notes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));
CREATE POLICY "sellers_update_txn_notes" ON public.transaction_notes FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_LINKS
CREATE POLICY "parties_select_txn_links" ON public.transaction_links FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_txn_links" ON public.transaction_links FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));
CREATE POLICY "sellers_update_txn_links" ON public.transaction_links FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_PARTICIPANTS
CREATE POLICY "parties_select_txn_participants" ON public.transaction_participants FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_txn_participants" ON public.transaction_participants FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_MEDIA
CREATE POLICY "parties_select_txn_media" ON public.transaction_media FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_txn_media" ON public.transaction_media FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- TRANSACTION_EVENTS
CREATE POLICY "parties_select_txn_events" ON public.transaction_events FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- TRANSACTION_STATUS_HISTORY
CREATE POLICY "parties_select_txn_status_history" ON public.transaction_status_history FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- MONEY_STATUS_HISTORY
CREATE POLICY "parties_select_money_history" ON public.money_status_history FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- TRANSACTION_AGREEMENT_SNAPSHOTS
CREATE POLICY "parties_select_agreement_snapshots" ON public.transaction_agreement_snapshots FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- DELIVERY_TRACKING_DETAILS
CREATE POLICY "parties_select_delivery_tracking" ON public.delivery_tracking_details FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "sellers_insert_delivery_tracking" ON public.delivery_tracking_details FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));
CREATE POLICY "sellers_update_delivery_tracking" ON public.delivery_tracking_details FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND seller_id = auth.uid()));

-- DELIVERY_CONFIRMATIONS
CREATE POLICY "parties_select_delivery_confirmations" ON public.delivery_confirmations FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- DELIVERY_UPDATES
CREATE POLICY "parties_select_delivery_updates" ON public.delivery_updates FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "parties_insert_delivery_updates" ON public.delivery_updates FOR INSERT TO authenticated WITH CHECK (public.is_transaction_party(auth.uid(), transaction_id));

-- DELIVERY_PROOF_FILES
CREATE POLICY "parties_select_delivery_proofs" ON public.delivery_proof_files FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "parties_insert_delivery_proofs" ON public.delivery_proof_files FOR INSERT TO authenticated WITH CHECK (public.is_transaction_party(auth.uid(), transaction_id) AND auth.uid() = uploaded_by_user_id);

-- PAYMENTS
CREATE POLICY "parties_select_payments" ON public.payments FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "admins_select_all_payments" ON public.payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ESCROW_STATES
CREATE POLICY "parties_select_escrow_states" ON public.escrow_states FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- ESCROW_LEDGER_ENTRIES
CREATE POLICY "parties_select_escrow_ledger" ON public.escrow_ledger_entries FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));

-- PAYOUTS
CREATE POLICY "sellers_select_own_payouts" ON public.payouts FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "admins_select_all_payouts" ON public.payouts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- REFUNDS
CREATE POLICY "buyers_select_own_refunds" ON public.refunds FOR SELECT TO authenticated USING (auth.uid() = buyer_id);
CREATE POLICY "admins_select_all_refunds" ON public.refunds FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- FILES
CREATE POLICY "users_select_own_files" ON public.files FOR SELECT TO authenticated USING (auth.uid() = uploaded_by_user_id);
CREATE POLICY "users_insert_own_files" ON public.files FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by_user_id);

-- DISPUTES
CREATE POLICY "parties_select_disputes" ON public.disputes FOR SELECT TO authenticated USING (public.is_transaction_party(auth.uid(), transaction_id));
CREATE POLICY "admins_select_all_disputes" ON public.disputes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "buyers_insert_disputes" ON public.disputes FOR INSERT TO authenticated WITH CHECK (auth.uid() = opened_by_user_id AND EXISTS (SELECT 1 FROM public.transactions WHERE id = transaction_id AND buyer_id = auth.uid()));

-- DISPUTE_RESPONSES
CREATE POLICY "parties_select_dispute_responses" ON public.dispute_responses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND public.is_transaction_party(auth.uid(), d.transaction_id)));
CREATE POLICY "sellers_insert_dispute_responses" ON public.dispute_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = responded_by_user_id AND EXISTS (SELECT 1 FROM public.disputes d JOIN public.transactions t ON t.id = d.transaction_id WHERE d.id = dispute_id AND t.seller_id = auth.uid()));

-- DISPUTE_EVIDENCE
CREATE POLICY "parties_select_dispute_evidence" ON public.dispute_evidence FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND public.is_transaction_party(auth.uid(), d.transaction_id)));
CREATE POLICY "parties_insert_dispute_evidence" ON public.dispute_evidence FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by_user_id AND EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND public.is_transaction_party(auth.uid(), d.transaction_id)));

-- DISPUTE_STATUS_HISTORY
CREATE POLICY "parties_select_dispute_status_history" ON public.dispute_status_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND public.is_transaction_party(auth.uid(), d.transaction_id)));

-- DISPUTE_OUTCOMES
CREATE POLICY "parties_select_dispute_outcomes" ON public.dispute_outcomes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND public.is_transaction_party(auth.uid(), d.transaction_id)));

-- ADMIN_ACTIONS
CREATE POLICY "admins_select_admin_actions" ON public.admin_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_admin_actions" ON public.admin_actions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = admin_user_id);

-- CASE_REVIEWS
CREATE POLICY "admins_select_case_reviews" ON public.case_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_case_reviews" ON public.case_reviews FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = reviewed_by_user_id);

-- SYSTEM_SETTINGS
CREATE POLICY "admins_select_system_settings" ON public.system_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_system_settings" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_system_settings" ON public.system_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- TIMEOUT_RULES
CREATE POLICY "admins_select_timeout_rules" ON public.timeout_rules FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_timeout_rules" ON public.timeout_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_timeout_rules" ON public.timeout_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- AUDIT_LOGS
CREATE POLICY "admins_select_audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- NOTIFICATION_DELIVERIES
CREATE POLICY "admins_select_notification_deliveries" ON public.notification_deliveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- USER_REGION_ACCESS_LOGS
CREATE POLICY "admins_select_region_access_logs" ON public.user_region_access_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- SYSTEM TABLES: system_logs, background_jobs, payment_webhook_logs — no client policies (service role only)

-- ============================================================
-- Part 3 — Audit Safety (Delete Prevention Triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Delete not allowed on financial record in table %', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER prevent_payments_delete BEFORE DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();
CREATE TRIGGER prevent_escrow_ledger_delete BEFORE DELETE ON public.escrow_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();
CREATE TRIGGER prevent_payouts_delete BEFORE DELETE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();
CREATE TRIGGER prevent_refunds_delete BEFORE DELETE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();
CREATE TRIGGER prevent_escrow_states_delete BEFORE DELETE ON public.escrow_states FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();

-- ============================================================
-- Part 4 — Performance Views
-- ============================================================

CREATE OR REPLACE VIEW public.buyer_transactions_view AS
SELECT t.id, t.transaction_code, t.status, t.money_status, t.dispute_status, t.created_at, t.delivered_at, t.completed_at, tp.item_amount, tp.buyer_total_amount, tp.currency_code
FROM public.transactions t
LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
WHERE t.buyer_id = auth.uid();

CREATE OR REPLACE VIEW public.seller_transactions_view AS
SELECT t.id, t.transaction_code, t.status, t.money_status, t.dispute_status, t.created_at, t.delivered_at, t.completed_at, tp.item_amount, tp.seller_net_amount, tp.currency_code
FROM public.transactions t
LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
WHERE t.seller_id = auth.uid();

CREATE OR REPLACE VIEW public.admin_dispute_summary_view AS
SELECT d.id, d.transaction_id, t.transaction_code, d.status, d.reason, d.opened_at, d.resolved_at, d.opened_by_user_id, p.full_name AS opened_by_name
FROM public.disputes d
JOIN public.transactions t ON t.id = d.transaction_id
LEFT JOIN public.profiles p ON p.id = d.opened_by_user_id;
