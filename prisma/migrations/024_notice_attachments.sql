ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS attachment_url varchar(300),
  ADD COLUMN IF NOT EXISTS attachment_name varchar(255),
  ADD COLUMN IF NOT EXISTS attachment_type varchar(100);

ALTER TABLE notices
  ADD CONSTRAINT notices_attachment_fields_check
  CHECK (
    (attachment_url IS NULL AND attachment_name IS NULL AND attachment_type IS NULL)
    OR (
      attachment_url IS NOT NULL
      AND attachment_name IS NOT NULL
      AND attachment_type IN (
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf'
      )
    )
  );
