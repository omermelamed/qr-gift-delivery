-- ============================================================
-- Helper functions — read company_id and role_name from JWT
-- ============================================================
CREATE OR REPLACE FUNCTION auth.jwt_company_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.jwt_role_name()
RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT auth.jwt_role_name() = 'platform_admin'
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_tokens         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- companies
-- ============================================================
CREATE POLICY "companies_platform_admin" ON companies
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "companies_read_own" ON companies
  FOR SELECT USING (id = auth.jwt_company_id());

-- ============================================================
-- roles
-- ============================================================
CREATE POLICY "roles_platform_admin" ON roles
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "roles_read_company" ON roles
  FOR SELECT USING (
    company_id IS NULL OR company_id = auth.jwt_company_id()
  );

-- ============================================================
-- permissions — readable by all authenticated users (middleware uses this)
-- ============================================================
CREATE POLICY "permissions_read_all" ON permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- role_permissions — readable by all (middleware uses this)
-- ============================================================
CREATE POLICY "role_permissions_read_all" ON role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- user_company_roles
-- ============================================================
CREATE POLICY "ucr_platform_admin" ON user_company_roles
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "ucr_read_own" ON user_company_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ucr_company_admin_manage" ON user_company_roles
  FOR ALL USING (company_id = auth.jwt_company_id());

-- ============================================================
-- campaigns — company-scoped
-- ============================================================
CREATE POLICY "campaigns_platform_admin" ON campaigns
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "campaigns_company_isolation" ON campaigns
  FOR ALL USING (company_id = auth.jwt_company_id())
  WITH CHECK (company_id = auth.jwt_company_id());

-- ============================================================
-- gift_tokens — inherit company scope through campaigns
-- ============================================================
CREATE POLICY "gift_tokens_platform_admin" ON gift_tokens
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "gift_tokens_company_isolation" ON gift_tokens
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
