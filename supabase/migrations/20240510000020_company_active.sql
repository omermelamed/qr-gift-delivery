-- Add active flag to companies
-- Existing companies default to active = true

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
