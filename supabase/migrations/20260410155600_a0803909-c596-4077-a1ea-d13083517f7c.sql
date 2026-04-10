
-- Make city_name nullable to support state-level visibility rows
ALTER TABLE public.serviceable_regions ALTER COLUMN city_name DROP NOT NULL;

-- Update old placeholder row to a valid LGA instead of deleting (FK constraint)
UPDATE public.serviceable_regions
SET city_name = 'Ikeja'
WHERE country_code = 'NG' AND state_name = 'Lagos' AND city_name = 'Lagos';

-- Seed remaining 19 Lagos LGAs (active)
INSERT INTO public.serviceable_regions (country_code, state_name, city_name, is_active, launch_phase) VALUES
  ('NG', 'Lagos', 'Agege', true, 1),
  ('NG', 'Lagos', 'Ajeromi-Ifelodun', true, 1),
  ('NG', 'Lagos', 'Alimosho', true, 1),
  ('NG', 'Lagos', 'Amuwo-Odofin', true, 1),
  ('NG', 'Lagos', 'Apapa', true, 1),
  ('NG', 'Lagos', 'Badagry', true, 1),
  ('NG', 'Lagos', 'Epe', true, 1),
  ('NG', 'Lagos', 'Eti-Osa', true, 1),
  ('NG', 'Lagos', 'Ibeju-Lekki', true, 1),
  ('NG', 'Lagos', 'Ifako-Ijaiye', true, 1),
  ('NG', 'Lagos', 'Ikorodu', true, 1),
  ('NG', 'Lagos', 'Kosofe', true, 1),
  ('NG', 'Lagos', 'Lagos Island', true, 1),
  ('NG', 'Lagos', 'Lagos Mainland', true, 1),
  ('NG', 'Lagos', 'Mushin', true, 1),
  ('NG', 'Lagos', 'Ojo', true, 1),
  ('NG', 'Lagos', 'Oshodi-Isolo', true, 1),
  ('NG', 'Lagos', 'Shomolu', true, 1),
  ('NG', 'Lagos', 'Surulere', true, 1);

-- Seed non-Lagos states (visibility only, city_name = NULL, is_active = false)
INSERT INTO public.serviceable_regions (country_code, state_name, city_name, is_active, launch_phase) VALUES
  ('NG', 'Abia', NULL, false, 1),
  ('NG', 'Adamawa', NULL, false, 1),
  ('NG', 'Akwa Ibom', NULL, false, 1),
  ('NG', 'Anambra', NULL, false, 1),
  ('NG', 'Bauchi', NULL, false, 1),
  ('NG', 'Bayelsa', NULL, false, 1),
  ('NG', 'Benue', NULL, false, 1),
  ('NG', 'Borno', NULL, false, 1),
  ('NG', 'Cross River', NULL, false, 1),
  ('NG', 'Delta', NULL, false, 1),
  ('NG', 'Ebonyi', NULL, false, 1),
  ('NG', 'Edo', NULL, false, 1),
  ('NG', 'Ekiti', NULL, false, 1),
  ('NG', 'Enugu', NULL, false, 1),
  ('NG', 'Federal Capital Territory', NULL, false, 1),
  ('NG', 'Gombe', NULL, false, 1),
  ('NG', 'Imo', NULL, false, 1),
  ('NG', 'Jigawa', NULL, false, 1),
  ('NG', 'Kaduna', NULL, false, 1),
  ('NG', 'Kano', NULL, false, 1),
  ('NG', 'Katsina', NULL, false, 1),
  ('NG', 'Kebbi', NULL, false, 1),
  ('NG', 'Kogi', NULL, false, 1),
  ('NG', 'Kwara', NULL, false, 1),
  ('NG', 'Nasarawa', NULL, false, 1),
  ('NG', 'Niger', NULL, false, 1),
  ('NG', 'Ogun', NULL, false, 1),
  ('NG', 'Ondo', NULL, false, 1),
  ('NG', 'Osun', NULL, false, 1),
  ('NG', 'Oyo', NULL, false, 1),
  ('NG', 'Plateau', NULL, false, 1),
  ('NG', 'Rivers', NULL, false, 1),
  ('NG', 'Sokoto', NULL, false, 1),
  ('NG', 'Taraba', NULL, false, 1),
  ('NG', 'Yobe', NULL, false, 1),
  ('NG', 'Zamfara', NULL, false, 1);
