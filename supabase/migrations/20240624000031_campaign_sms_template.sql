-- Optional per-campaign SMS override. NULL = use the company default
-- (companies.sms_template); if that is null too, the built-in default message.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sms_template TEXT;
