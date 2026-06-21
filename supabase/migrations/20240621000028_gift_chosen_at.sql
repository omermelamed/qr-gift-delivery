-- Decouple gift choice from redemption: timestamp set when the employee
-- (or an admin) picks a gift, independent of whether it has been redeemed.
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS gift_chosen_at TIMESTAMPTZ;
