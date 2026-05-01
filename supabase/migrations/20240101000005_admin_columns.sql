-- Add campaign date to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_date DATE;

-- Add optional department to gift_tokens
ALTER TABLE gift_tokens ADD COLUMN IF NOT EXISTS department TEXT;

-- Add campaigns:manage permission for token upload, resend, export
-- (campaigns:create, campaigns:launch, reports:export already exist)
-- No new permissions needed — existing ones cover Phase 3 routes:
--   campaigns:create  → POST /api/campaigns, POST /api/campaigns/[id]/tokens
--   campaigns:launch  → POST /api/campaigns/[id]/resend
--   reports:export    → GET /api/campaigns/[id]/export
