ALTER TABLE public.institute_public_profiles
    ADD COLUMN IF NOT EXISTS institute_name varchar(180) NOT NULL DEFAULT 'AMRPI',
    ADD COLUMN IF NOT EXISTS hero_title varchar(240) NOT NULL DEFAULT 'Anjuman Moklesur Rahman Polytechnic Institute',
    ADD COLUMN IF NOT EXISTS hero_title_bn varchar(240) NOT NULL DEFAULT 'আঞ্জুমান মুকলেসুর রহমান পলিটেকনিক ইনস্টিটিউট',
    ADD COLUMN IF NOT EXISTS hero_description varchar(1000) NOT NULL DEFAULT 'Find published results, apply to an institute, track your application, and read official notices in one place.';

UPDATE public.institute_public_profiles p
SET institute_name = COALESCE(NULLIF(trim(p.display_name), ''), i.name, 'AMRPI')
FROM public.institutes i
WHERE i.id = p.institute_id
  AND (p.institute_name IS NULL OR trim(p.institute_name) = '' OR p.institute_name = 'AMRPI');

UPDATE public.institute_public_profiles
SET hero_title = 'Anjuman Moklesur Rahman Polytechnic Institute',
    hero_title_bn = 'আঞ্জুমান মুকলেসুর রহমান পলিটেকনিক ইনস্টিটিউট',
    hero_description = 'Find published results, apply to an institute, track your application, and read official notices in one place.'
WHERE hero_title IS NULL OR trim(hero_title) = '';
