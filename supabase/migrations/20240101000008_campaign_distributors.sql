CREATE TABLE IF NOT EXISTS campaign_distributors (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS campaign_distributors_campaign_idx
  ON campaign_distributors (campaign_id);

ALTER TABLE campaign_distributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage campaign distributors"
  ON campaign_distributors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_distributors.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  );
