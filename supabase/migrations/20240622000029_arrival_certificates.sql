-- Arrival Certificates (אישור הגעה): optional per-campaign RSVP layer.
-- Opt-in flag defaults FALSE so existing campaigns are unaffected.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS supports_arrival_certificates BOOLEAN NOT NULL DEFAULT FALSE;

-- Attendance response lives on the per-employee token row.
--   attending      NULL  = no response yet, TRUE = coming, FALSE = not coming
--   attendee_count headcount INCLUDING the person; required iff attending = TRUE
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS attending      BOOLEAN,
  ADD COLUMN IF NOT EXISTS attendee_count INT,
  ADD COLUMN IF NOT EXISTS responded_at   TIMESTAMPTZ;

ALTER TABLE gift_tokens
  ADD CONSTRAINT attendee_count_consistency CHECK (
    (attending = TRUE AND attendee_count IS NOT NULL AND attendee_count >= 1) OR
    (attending IS DISTINCT FROM TRUE AND attendee_count IS NULL)
  );
