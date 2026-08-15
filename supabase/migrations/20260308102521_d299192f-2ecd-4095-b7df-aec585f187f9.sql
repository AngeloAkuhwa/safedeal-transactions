
-- SafeDeal Seed: Auth Users (reserved schema - requires migration)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'buyer@samplestore.test', NULL /* password removed: a committed credential must never be replayable. Provision with scripts/provision-e2e-identities.mjs. */, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Tunde Adeyemi"}', now() - interval '30 days', now(), '', '', '', ''),
  ('a1b2c3d4-0002-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seller@samplestore.test', NULL /* password removed: a committed credential must never be replayable. Provision with scripts/provision-e2e-identities.mjs. */, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Chioma Okafor"}', now() - interval '30 days', now(), '', '', '', ''),
  ('a1b2c3d4-0003-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@safedeal.test', NULL /* password removed: a committed credential must never be replayable. Provision with scripts/provision-e2e-identities.mjs. */, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"SafeDeal Admin"}', now() - interval '30 days', now(), '', '', '', '');

-- Profiles
INSERT INTO public.profiles (id, email, phone, full_name, default_role, status, country_code, state_name, city_name, is_region_eligible, default_region_id, last_login_at)
VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'buyer@samplestore.test', '+2348010000001', 'Tunde Adeyemi', 'buyer', 'active', 'NG', 'Lagos', 'Lagos', true, (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), now() - interval '1 hour'),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'seller@samplestore.test', '+2348010000002', 'Chioma Okafor', 'seller', 'active', 'NG', 'Lagos', 'Lagos', true, (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), now() - interval '2 hours'),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'admin@safedeal.test', '+2348010000003', 'SafeDeal Admin', 'admin', 'active', 'NG', 'Lagos', 'Lagos', true, (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), now() - interval '30 minutes');

-- User Roles
INSERT INTO public.user_roles (user_id, role, is_primary) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'buyer', true),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'seller', true),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'admin', true);

-- Account Verifications
INSERT INTO public.account_verifications (user_id, email_verified, phone_verified, identity_verified, payout_verified) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', true, true, false, false),
  ('a1b2c3d4-0002-4000-8000-000000000002', true, true, true, true),
  ('a1b2c3d4-0003-4000-8000-000000000003', true, true, true, true);

-- Notification Preferences
INSERT INTO public.notification_preferences (user_id) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001'),
  ('a1b2c3d4-0002-4000-8000-000000000002'),
  ('a1b2c3d4-0003-4000-8000-000000000003');

-- Transactions
INSERT INTO public.transactions (id, transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, dispute_status, share_token, region_id, buyer_contact_email, buyer_contact_phone, agreement_locked_at, payment_received_at, delivered_at, verification_deadline_at, completed_at, cancelled_at, cancellation_reason, created_at)
VALUES
  ('b1000001-0001-4000-8000-000000000001', 'SD-2026-000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002', 'awaiting_payment', 'payment_pending', 'none', 'tok_seed_001', (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), 'buyer@samplestore.test', '+2348010000001', NULL, NULL, NULL, NULL, NULL, NULL, NULL, now() - interval '2 hours'),
  ('b1000001-0002-4000-8000-000000000002', 'SD-2026-000002', 'a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002', 'seller_preparing_delivery', 'funds_held_in_escrow', 'none', 'tok_seed_002', (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), 'buyer@samplestore.test', '+2348010000001', now() - interval '20 hours', now() - interval '20 hours', NULL, NULL, NULL, NULL, NULL, now() - interval '1 day'),
  ('b1000001-0003-4000-8000-000000000003', 'SD-2026-000003', 'a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002', 'delivered_awaiting_verification', 'funds_held_in_escrow', 'none', 'tok_seed_003', (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), 'buyer@samplestore.test', '+2348010000001', now() - interval '68 hours', now() - interval '68 hours', now() - interval '24 hours', now() + interval '24 hours', NULL, NULL, NULL, now() - interval '3 days'),
  ('b1000001-0004-4000-8000-000000000004', 'SD-2026-000004', 'a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002', 'disputed', 'funds_frozen', 'open', 'tok_seed_004', (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), 'buyer@samplestore.test', '+2348010000001', now() - interval '108 hours', now() - interval '108 hours', now() - interval '72 hours', now() - interval '24 hours', NULL, NULL, NULL, now() - interval '5 days'),
  ('b1000001-0005-4000-8000-000000000005', 'SD-2026-000005', 'a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002', 'completed', 'funds_released', 'none', 'tok_seed_005', (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), 'buyer@samplestore.test', '+2348010000001', now() - interval '156 hours', now() - interval '156 hours', now() - interval '96 hours', now() - interval '72 hours', now() - interval '48 hours', NULL, NULL, now() - interval '7 days'),
  ('b1000001-0006-4000-8000-000000000006', 'SD-2026-000006', 'a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002', 'timed_out', 'refund_issued', 'none', 'tok_seed_006', (SELECT id FROM public.serviceable_regions WHERE country_code='NG' AND city_name='Lagos' LIMIT 1), 'buyer@samplestore.test', '+2348010000001', now() - interval '228 hours', now() - interval '228 hours', NULL, NULL, NULL, now() - interval '168 hours', 'Seller failed to fulfill within delivery window', now() - interval '10 days');
