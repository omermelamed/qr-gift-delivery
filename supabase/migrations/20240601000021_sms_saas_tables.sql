-- ============================================================
-- SMS Bulk Messaging SaaS — schema additions
-- Builds on existing multi-tenant companies table
-- ============================================================

-- ============================================================
-- Credits — one row per tenant, tracks current balance
-- ============================================================
CREATE TABLE credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_used      INTEGER NOT NULL DEFAULT 0,
  balance         INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT balance_non_negative CHECK (balance >= 0),
  CONSTRAINT balance_consistency CHECK (balance = total_purchased - total_used)
);

-- ============================================================
-- Credit transactions — immutable ledger
-- ============================================================
CREATE TYPE credit_transaction_type AS ENUM ('purchase', 'use', 'refund');

CREATE TABLE credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  type        credit_transaction_type NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================
-- Message templates — reusable SMS templates per tenant
-- ============================================================
CREATE TABLE message_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  body_template  TEXT NOT NULL,
  variables      TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SMS campaigns — bulk send jobs, separate from gift campaigns
-- ============================================================
CREATE TYPE sms_campaign_status AS ENUM ('draft', 'validating', 'sending', 'sent', 'failed', 'cancelled');

CREATE TABLE sms_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  template_id      UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  status           sms_campaign_status NOT NULL DEFAULT 'draft',
  recipients_count INTEGER NOT NULL DEFAULT 0,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);

-- ============================================================
-- SMS messages — one per recipient per campaign
-- ============================================================
CREATE TYPE sms_message_status AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'undelivered');

CREATE TABLE sms_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  recipient_name  TEXT,
  body            TEXT NOT NULL,
  status          sms_message_status NOT NULL DEFAULT 'pending',
  provider_id     TEXT,
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX credits_company_idx              ON credits (company_id);
CREATE INDEX credit_transactions_company_idx  ON credit_transactions (company_id);
CREATE INDEX credit_transactions_created_idx  ON credit_transactions (created_at DESC);
CREATE INDEX message_templates_company_idx    ON message_templates (company_id);
CREATE INDEX sms_campaigns_company_idx        ON sms_campaigns (company_id);
CREATE INDEX sms_campaigns_status_idx         ON sms_campaigns (status);
CREATE INDEX sms_messages_campaign_idx        ON sms_messages (campaign_id);
CREATE INDEX sms_messages_status_idx          ON sms_messages (status);

-- ============================================================
-- RLS policies
-- ============================================================
ALTER TABLE credits              ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages         ENABLE ROW LEVEL SECURITY;

-- credits
CREATE POLICY "credits_platform_admin" ON credits
  FOR ALL USING (coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '') = 'platform_admin');

CREATE POLICY "credits_company_isolation" ON credits
  FOR SELECT USING (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid);

-- credit_transactions
CREATE POLICY "credit_transactions_platform_admin" ON credit_transactions
  FOR ALL USING (coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '') = 'platform_admin');

CREATE POLICY "credit_transactions_company_isolation" ON credit_transactions
  FOR SELECT USING (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid);

-- message_templates
CREATE POLICY "message_templates_platform_admin" ON message_templates
  FOR ALL USING (coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '') = 'platform_admin');

CREATE POLICY "message_templates_company_isolation" ON message_templates
  FOR ALL USING (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid)
  WITH CHECK (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid);

-- sms_campaigns
CREATE POLICY "sms_campaigns_platform_admin" ON sms_campaigns
  FOR ALL USING (coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '') = 'platform_admin');

CREATE POLICY "sms_campaigns_company_isolation" ON sms_campaigns
  FOR ALL USING (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid)
  WITH CHECK (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid);

-- sms_messages (inherit company scope through sms_campaigns)
CREATE POLICY "sms_messages_platform_admin" ON sms_messages
  FOR ALL USING (coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '') = 'platform_admin');

CREATE POLICY "sms_messages_company_isolation" ON sms_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sms_campaigns sc
      WHERE sc.id = campaign_id
        AND sc.company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sms_campaigns sc
      WHERE sc.id = campaign_id
        AND sc.company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    )
  );
