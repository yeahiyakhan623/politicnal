ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS sender_phone varchar(24);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS is_legacy_payment boolean NOT NULL DEFAULT false;

UPDATE subscriptions
SET is_legacy_payment = true
WHERE currency <> 'BDT'
   OR payment_provider NOT IN ('bkash', 'nagad', 'rocket', 'bank_transfer')
   OR sender_phone IS NULL
   OR length(sender_phone) NOT BETWEEN 8 AND 24;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_currency_check,
  DROP CONSTRAINT IF EXISTS subscriptions_payment_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_currency_check
    CHECK (is_legacy_payment OR currency = 'BDT'),
  ADD CONSTRAINT subscriptions_payment_provider_check
    CHECK (is_legacy_payment OR payment_provider IN ('bkash', 'nagad', 'rocket', 'bank_transfer')),
  ADD CONSTRAINT subscriptions_sender_phone_check
    CHECK (is_legacy_payment OR (sender_phone IS NOT NULL AND length(sender_phone) BETWEEN 8 AND 24));
