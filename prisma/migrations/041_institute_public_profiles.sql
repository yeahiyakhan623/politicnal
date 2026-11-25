-- Extend the legacy profile table in place so existing institute data is preserved.
ALTER TABLE public.institute_public_profiles
    ADD COLUMN IF NOT EXISTS overview text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS leadership jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS departments jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS contact jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.institute_public_profiles
SET overview = COALESCE(NULLIF(overview, ''), NULLIF(description, ''), ''),
    history = COALESCE(history, ''),
    contact = jsonb_strip_nulls(jsonb_build_object(
        'address', full_address,
        'phones', CASE
            WHEN contact_phone IS NOT NULL AND trim(contact_phone) <> ''
            THEN jsonb_build_array(contact_phone)
            ELSE '[]'::jsonb
        END,
        'email', contact_email
    ));

ALTER TABLE public.institute_public_profiles
    ALTER COLUMN history SET DEFAULT '',
    ALTER COLUMN history SET NOT NULL;

ALTER TABLE public.institute_public_profiles
    ADD CONSTRAINT institute_public_profiles_leadership_array_check
        CHECK (jsonb_typeof(leadership) = 'array') NOT VALID,
    ADD CONSTRAINT institute_public_profiles_departments_array_check
        CHECK (jsonb_typeof(departments) = 'array') NOT VALID,
    ADD CONSTRAINT institute_public_profiles_services_array_check
        CHECK (jsonb_typeof(services) = 'array') NOT VALID,
    ADD CONSTRAINT institute_public_profiles_contact_object_check
        CHECK (jsonb_typeof(contact) = 'object') NOT VALID,
    ADD CONSTRAINT institute_public_profiles_links_array_check
        CHECK (jsonb_typeof(links) = 'array') NOT VALID;

INSERT INTO public.institute_public_profiles (
    institute_id, overview, history, leadership, departments, services, contact, links
)
SELECT
    i.id,
    'Anjuman Moklesur Rahman Polytechnic Institute is a technical education institute in Shyamoli, Dhaka. The institute offers diploma-level technology programs and supports students in developing practical skills for further study and careers.',
    'Founded to expand access to career-focused technical education, AMRPI brings together academic instruction, practical learning, and student support. Its community works to prepare learners for the changing needs of industry and society.',
    '[
      {"id":"leader-advisor","name":"Professor Md. Khalilur Rahman","designation":"Honorable Advisor","bio":"Former Director General, NAEM.","imageUrl":""},
      {"id":"leader-donor","name":"Md. Mokhlesur Rahman","designation":"Donor & Honorable Advisor","bio":"Land and building donor.","imageUrl":""},
      {"id":"leader-principal","name":"Md. Golam Rahman","designation":"Principal (Acting)","bio":"Institute leadership.","imageUrl":""}
    ]'::jsonb,
    '[
      {"id":"department-computer","name":"Diploma in Computer Technology","description":"Computing, software, and information technology."},
      {"id":"department-civil","name":"Diploma in Civil Technology","description":"Civil engineering, construction, and infrastructure."},
      {"id":"department-electrical","name":"Diploma in Electrical Technology","description":"Electrical systems, machines, and power."},
      {"id":"department-automobile","name":"Diploma in Automobile Technology","description":"Vehicle systems, maintenance, and automotive technology."},
      {"id":"department-non-tech","name":"Non-Tech Department","description":"General and supporting academic subjects."}
    ]'::jsonb,
    '[
      {"id":"service-placement","name":"Job Placement","description":"Career guidance and job-placement information for diploma graduates."},
      {"id":"service-attachment","name":"Industrial Attachment","description":"Practical learning through industrial attachment and institutional linkages."},
      {"id":"service-stipend","name":"Stipend Form (SAF)","description":"Contact the institute office for the current DTE Student Application Form and submission guidance."},
      {"id":"service-basic-trade","name":"Basic Trade Course","description":"Contact the institute for current admission information for the 360-hour course."}
    ]'::jsonb,
    '{"address":"2/Q Golden Street Road, Shyamoli, Dhaka","phones":["+88-02222241190"],"email":"info.amrpi@anjumanmibd.org"}'::jsonb,
    '[
      {"id":"link-bteb","label":"BTEB","description":"Bangladesh Technical Education Board","url":"https://bteb.gov.bd/"},
      {"id":"link-dte","label":"DTE","description":"Directorate of Technical Education","url":"https://techedu.gov.bd/"},
      {"id":"link-ministry","label":"Ministry of Education","description":"Government of Bangladesh","url":"https://moedu.gov.bd/"}
    ]'::jsonb
FROM public.institutes i
WHERE i.category = 'polytechnic' AND i.review_status = 'approved'
ON CONFLICT (institute_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS institute_public_profiles_updated_at_idx
    ON public.institute_public_profiles (updated_at DESC);
