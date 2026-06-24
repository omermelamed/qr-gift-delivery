-- Per-campaign cap on RSVP headcount for Arrival Certificates mode.
-- NULL = no limit. Counts TOTAL people including the employee, matching
-- gift_tokens.attendee_count.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS max_attendee_count INT;

ALTER TABLE campaigns
  ADD CONSTRAINT max_attendee_count_positive
  CHECK (max_attendee_count IS NULL OR max_attendee_count >= 1);
