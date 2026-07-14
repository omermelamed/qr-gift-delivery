-- One-time cleanup: removes all test/throwaway campaigns created during
-- development, keeping only the one real campaign in production. All child
-- tables (gift_tokens, campaign_gifts, campaign_notes, campaign_distributors)
-- cascade-delete via their existing ON DELETE CASCADE foreign keys.
DELETE FROM campaigns
WHERE id != '8a58fd6d-4b38-4442-bbd2-80c38abb16d8';
