-- ============================================================
-- Security hardening (2026-06-20 assessment)
-- ============================================================

-- C3: campaign_notes had RLS disabled → cross-tenant read/write via anon key.
ALTER TABLE campaign_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_notes_platform_admin" ON campaign_notes
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "campaign_notes_company_isolation" ON campaign_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id
        AND c.company_id = auth.jwt_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id
        AND c.company_id = auth.jwt_company_id()
    )
  );

-- H3: the qr-codes storage INSERT policy allowed ANY authenticated user to
-- upload arbitrary objects. Restrict writes to the service role only.
-- (Legitimate QR uploads happen server-side via the service-role client.)
DROP POLICY IF EXISTS "qr_codes_service_insert" ON storage.objects;

CREATE POLICY "qr_codes_service_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'qr-codes');

-- Also prevent enumeration of objects via the authenticated list/download API.
-- Public <img> rendering uses the public CDN URL, which is unaffected by this.
DROP POLICY IF EXISTS "qr_codes_public_read" ON storage.objects;

CREATE POLICY "qr_codes_service_read" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'qr-codes');
