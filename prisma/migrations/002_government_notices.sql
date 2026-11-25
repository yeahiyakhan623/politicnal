CREATE TABLE IF NOT EXISTS government_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(500) NOT NULL,
  category varchar(20) NOT NULL
    CHECK (category IN ('board', 'dshe', 'bteb', 'holidays')),
  source_name varchar(120) NOT NULL,
  source_url text NOT NULL,
  pdf_url text NOT NULL,
  published_at date,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_name, pdf_url)
);

CREATE INDEX IF NOT EXISTS government_notices_published_category_idx
  ON government_notices (published_at DESC NULLS LAST, category, created_at DESC);
CREATE INDEX IF NOT EXISTS government_notices_title_search_idx
  ON government_notices USING gin (to_tsvector('simple', title));
