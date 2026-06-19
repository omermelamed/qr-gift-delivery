ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scheduled_confirmed_at TIMESTAMPTZ;
