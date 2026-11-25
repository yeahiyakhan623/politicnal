CREATE TABLE IF NOT EXISTS public.student_nfc_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS student_nfc_cards_one_active_per_student
    ON public.student_nfc_cards (student_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS student_nfc_cards_institute_student_idx
    ON public.student_nfc_cards (institute_id, student_id);

CREATE TABLE IF NOT EXISTS public.student_nfc_scan_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id uuid NOT NULL REFERENCES public.student_nfc_cards(id) ON DELETE RESTRICT,
    scan_method varchar(8) NOT NULL CHECK (scan_method IN ('nfc', 'qr')),
    scanned_at timestamptz NOT NULL DEFAULT now(),
    scanner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS student_nfc_scan_logs_card_scanned_idx
    ON public.student_nfc_scan_logs (card_id, scanned_at DESC);
