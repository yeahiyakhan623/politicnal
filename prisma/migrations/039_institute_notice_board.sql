CREATE TABLE IF NOT EXISTS public.institute_notices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '',
    category varchar(80) NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
    notice_date date NOT NULL,
    format varchar(12) NOT NULL CHECK (format IN ('document', 'image')),
    attachment_name varchar(255),
    attachment_mime_type varchar(100),
    attachment_size integer,
    attachment_data bytea,
    is_published boolean NOT NULL DEFAULT true,
    created_by uuid NOT NULL REFERENCES public.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (format = 'document' AND attachment_data IS NULL AND attachment_mime_type IS NULL)
        OR
        (format = 'image' AND attachment_name IS NOT NULL AND attachment_mime_type IS NOT NULL
            AND attachment_size > 0 AND attachment_data IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS institute_notices_public_board_idx
    ON public.institute_notices (institute_id, is_published, notice_date DESC, created_at DESC);
