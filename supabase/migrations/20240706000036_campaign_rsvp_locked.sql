-- Freezes new "yes" RSVPs for a single campaign. Anyone already marked
-- attending = true stays registered; everyone else can no longer flip to
-- true while this is on. Default FALSE means no other campaign is affected.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS rsvp_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- One-time flip for the campaign this was requested for. No admin UI exists
-- to set this yet — extend PATCH /api/campaigns/[id] if a future campaign
-- needs it.
UPDATE campaigns
  SET rsvp_locked = TRUE
  WHERE id = '8a58fd6d-4b38-4442-bbd2-80c38abb16d8';
