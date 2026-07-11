-- Resume position for the step-by-step campaign creation wizard.
-- 1-based step index (1..5). A draft campaign reopens at this step so the
-- admin lands where they left off. Launched campaigns ignore it.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS wizard_last_step SMALLINT NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE campaigns
    ADD CONSTRAINT wizard_last_step_range
    CHECK (wizard_last_step BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
