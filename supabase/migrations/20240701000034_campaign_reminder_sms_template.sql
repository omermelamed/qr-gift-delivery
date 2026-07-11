-- Optional per-campaign reminder SMS override. NULL = use the effective primary
-- message (campaign.sms_template -> companies.sms_template -> built-in default).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS reminder_sms_template TEXT;
