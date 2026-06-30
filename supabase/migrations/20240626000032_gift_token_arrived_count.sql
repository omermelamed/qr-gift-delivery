-- Actual number of people who showed up at pickup, recorded by the distributor
-- at scan time (vs. attendee_count = the planned headcount the employee RSVP'd).
-- Lets HR compare planned vs. actual arrivals for arrival-certificate campaigns.
ALTER TABLE gift_tokens ADD COLUMN IF NOT EXISTS arrived_count int;
