CREATE TABLE IF NOT EXISTS public.semester_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    semester smallint NOT NULL CHECK (semester BETWEEN 1 AND 8),
    department varchar(100) NOT NULL CHECK (length(trim(department)) BETWEEN 1 AND 100),
    code varchar(40),
    name varchar(160) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    credits numeric(5,2) NOT NULL DEFAULT 0 CHECK (credits >= 0),
    maximum_marks numeric(6,2) NOT NULL DEFAULT 100 CHECK (maximum_marks > 0),
    is_preset boolean NOT NULL DEFAULT false,
    legacy_subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS semester_subjects_institute_identity_unique
    ON public.semester_subjects (institute_id, semester, lower(trim(department)), lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS semester_subjects_institute_code_unique
    ON public.semester_subjects (institute_id, semester, lower(trim(department)), lower(trim(code)))
    WHERE code IS NOT NULL AND trim(code) <> '';

CREATE INDEX IF NOT EXISTS semester_subjects_directory_idx
    ON public.semester_subjects (institute_id, semester, department, is_active, name);

INSERT INTO public.semester_subjects
    (institute_id, semester, department, code, name, credits, maximum_marks,
     is_preset, legacy_subject_id, created_by)
SELECT DISTINCT ON (
           s.institute_id,
           (regexp_match(b.name, '([1-8])(?:st|nd|rd|th)?[[:space:]]*semester', 'i'))[1]::smallint,
           lower(trim(CASE
               WHEN lower(trim(b.department)) IN ('cst', 'computer', 'computer technology') THEN 'Computer Technology'
               WHEN lower(trim(b.department)) IN ('civil', 'civil technology') THEN 'Civil Technology'
               WHEN lower(trim(b.department)) IN ('electrical', 'electrical technology') THEN 'Electrical Technology'
               WHEN lower(trim(b.department)) IN ('mechanical', 'mechanical technology') THEN 'Mechanical Technology'
               WHEN lower(trim(b.department)) IN ('electronics', 'electronics technology') THEN 'Electronics Technology'
               WHEN lower(trim(b.department)) IN ('power', 'power technology') THEN 'Power Technology'
               WHEN lower(trim(b.department)) IN ('marine', 'marine technology') THEN 'Marine Technology'
               WHEN lower(trim(b.department)) IN ('architecture', 'architecture technology') THEN 'Architecture Technology'
               ELSE b.department
           END)),
           lower(trim(s.name))
       )
       s.institute_id,
       (regexp_match(b.name, '([1-8])(?:st|nd|rd|th)?[[:space:]]*semester', 'i'))[1]::smallint,
       trim(CASE
           WHEN lower(trim(b.department)) IN ('cst', 'computer', 'computer technology') THEN 'Computer Technology'
           WHEN lower(trim(b.department)) IN ('civil', 'civil technology') THEN 'Civil Technology'
           WHEN lower(trim(b.department)) IN ('electrical', 'electrical technology') THEN 'Electrical Technology'
           WHEN lower(trim(b.department)) IN ('mechanical', 'mechanical technology') THEN 'Mechanical Technology'
           WHEN lower(trim(b.department)) IN ('electronics', 'electronics technology') THEN 'Electronics Technology'
           WHEN lower(trim(b.department)) IN ('power', 'power technology') THEN 'Power Technology'
           WHEN lower(trim(b.department)) IN ('marine', 'marine technology') THEN 'Marine Technology'
           WHEN lower(trim(b.department)) IN ('architecture', 'architecture technology') THEN 'Architecture Technology'
           ELSE b.department
       END),
       NULLIF(trim(s.code), ''),
       trim(s.name),
       s.credits,
       GREATEST(s.written_full_marks + s.mcq_full_marks + s.practical_full_marks, 1),
       true,
       s.id,
       NULL
FROM public.subjects s
JOIN public.class_batches b
  ON b.id = s.class_batch_id
 AND b.institute_id = s.institute_id
WHERE s.category = 'polytechnic'
  AND b.department IS NOT NULL
  AND b.name ~* '^[1-8](st|nd|rd|th)?[[:space:]]*semester$'
ORDER BY
    s.institute_id,
    (regexp_match(b.name, '([1-8])(?:st|nd|rd|th)?[[:space:]]*semester', 'i'))[1]::smallint,
    lower(trim(CASE
        WHEN lower(trim(b.department)) IN ('cst', 'computer', 'computer technology') THEN 'Computer Technology'
        WHEN lower(trim(b.department)) IN ('civil', 'civil technology') THEN 'Civil Technology'
        WHEN lower(trim(b.department)) IN ('electrical', 'electrical technology') THEN 'Electrical Technology'
        WHEN lower(trim(b.department)) IN ('mechanical', 'mechanical technology') THEN 'Mechanical Technology'
        WHEN lower(trim(b.department)) IN ('electronics', 'electronics technology') THEN 'Electronics Technology'
        WHEN lower(trim(b.department)) IN ('power', 'power technology') THEN 'Power Technology'
        WHEN lower(trim(b.department)) IN ('marine', 'marine technology') THEN 'Marine Technology'
        WHEN lower(trim(b.department)) IN ('architecture', 'architecture technology') THEN 'Architecture Technology'
        ELSE b.department
    END)),
    lower(trim(s.name)),
    s.id
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.semester_exam_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.semester_subjects(id) ON DELETE RESTRICT,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    semester smallint NOT NULL CHECK (semester BETWEEN 1 AND 8),
    department varchar(100) NOT NULL CHECK (length(trim(department)) BETWEEN 1 AND 100),
    exam_name varchar(120) NOT NULL CHECK (length(trim(exam_name)) BETWEEN 1 AND 120),
    exam_year smallint NOT NULL CHECK (exam_year BETWEEN 1900 AND 9999),
    marks numeric(7,2),
    grade_point numeric(3,2) CHECK (grade_point IS NULL OR grade_point BETWEEN 0 AND 5),
    letter_grade varchar(10),
    status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_by uuid NOT NULL REFERENCES public.users(id),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (marks IS NOT NULL OR grade_point IS NOT NULL OR letter_grade IS NOT NULL),
    UNIQUE (institute_id, subject_id, student_id, exam_year, exam_name)
);

CREATE INDEX IF NOT EXISTS semester_exam_results_lookup_idx
    ON public.semester_exam_results
       (institute_id, semester, department, exam_year, exam_name, subject_id, status);
