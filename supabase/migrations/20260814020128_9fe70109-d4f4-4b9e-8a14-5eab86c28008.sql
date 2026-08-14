DO $$
DECLARE
  owner_id uuid;
  seed_id uuid;
  n int;
BEGIN
  SELECT id INTO owner_id FROM public.internal_users WHERE lower(email) = 'angeloakuhwa@gmail.com';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'owner internal_users row not found';
  END IF;

  SELECT id INTO seed_id FROM public.internal_users WHERE lower(email) = 'admin@safedeal.test';

  -- 1. Owner becomes the sole super_admin (super_admin must be exclusive).
  DELETE FROM public.internal_user_roles WHERE user_id = owner_id;
  INSERT INTO public.internal_user_roles (user_id, role_key)
  VALUES (owner_id, 'super_admin')
  ON CONFLICT DO NOTHING;

  UPDATE public.internal_users
     SET status = 'active', invitation_status = 'accepted'
   WHERE id = owner_id;

  -- 2. Neutralise the seed account (auth user is intentionally kept).
  IF seed_id IS NOT NULL THEN
    DELETE FROM public.internal_user_roles WHERE user_id = seed_id;
    UPDATE public.internal_users SET status = 'suspended' WHERE id = seed_id;
    DELETE FROM public.user_roles WHERE user_id = seed_id AND role = 'admin';
  END IF;

  -- 3. Verify exactly one active super_admin, and it is the owner.
  SELECT count(*) INTO n
    FROM public.internal_user_roles r
    JOIN public.internal_users u ON u.id = r.user_id
   WHERE r.role_key = 'super_admin' AND u.status = 'active';
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 active super_admin, found %', n;
  END IF;

  PERFORM 1 FROM public.internal_user_roles r
    JOIN public.internal_users u ON u.id = r.user_id
   WHERE r.role_key = 'super_admin' AND u.status = 'active' AND u.id = owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active super_admin is not the owner account';
  END IF;
END $$;