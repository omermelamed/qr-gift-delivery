-- ============================================================
-- Companies (tenants)
-- ============================================================
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Roles — system roles have company_id = NULL
-- ============================================================
CREATE TABLE roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE NULLS NOT DISTINCT (company_id, name)
);

-- ============================================================
-- Permissions — named actions, e.g. 'campaigns:create'
-- ============================================================
CREATE TABLE permissions (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- ============================================================
-- Role → Permission mapping
-- ============================================================
CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- User → Company → Role assignment
-- One row per user per company
-- ============================================================
CREATE TABLE user_company_roles (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

-- ============================================================
-- Campaigns — scoped to a company
-- ============================================================
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

-- ============================================================
-- Gift tokens — one per employee per campaign
-- ============================================================
CREATE TABLE gift_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  employee_name  TEXT NOT NULL,
  phone_number   TEXT NOT NULL,
  token          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  qr_image_url   TEXT,
  sms_sent_at    TIMESTAMPTZ,
  redeemed       BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at    TIMESTAMPTZ,
  redeemed_by    UUID REFERENCES auth.users ON DELETE SET NULL,
  CONSTRAINT redeemed_consistency CHECK (
    (redeemed = FALSE AND redeemed_at IS NULL AND redeemed_by IS NULL) OR
    (redeemed = TRUE AND redeemed_at IS NOT NULL)
  )
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX gift_tokens_token_idx       ON gift_tokens (token);
CREATE INDEX gift_tokens_campaign_idx    ON gift_tokens (campaign_id);
CREATE INDEX campaigns_company_idx       ON campaigns (company_id);
CREATE INDEX user_company_roles_user_idx ON user_company_roles (user_id);
