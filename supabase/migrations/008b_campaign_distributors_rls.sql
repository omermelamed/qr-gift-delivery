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
