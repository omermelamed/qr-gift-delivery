CREATE TABLE campaign_gifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaign_gifts_campaign_idx ON campaign_gifts (campaign_id, position);

ALTER TABLE campaign_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_gifts_company_isolation"
  ON campaign_gifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_gifts.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_gifts.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  );

ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS gift_id UUID REFERENCES campaign_gifts(id) ON DELETE SET NULL;
