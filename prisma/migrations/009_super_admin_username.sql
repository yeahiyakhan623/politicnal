ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username varchar(50);

CREATE UNIQUE INDEX IF NOT EXISTS users_super_admin_username_unique
  ON users (lower(username))
  WHERE role = 'super_admin' AND username IS NOT NULL;
