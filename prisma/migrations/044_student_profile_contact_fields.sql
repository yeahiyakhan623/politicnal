ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS father_name varchar(160),
    ADD COLUMN IF NOT EXISTS mother_name varchar(160),
    ADD COLUMN IF NOT EXISTS student_phone varchar(30);
