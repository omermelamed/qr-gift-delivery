-- Landing-page contact-form leads.
-- RLS is enabled with NO policies on purpose: anon and authenticated roles get
-- zero access. Only the service-role key (server-side /api/leads route) writes,
-- and the service role bypasses RLS.
CREATE TABLE leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name       TEXT NOT NULL,
  company    TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  message    TEXT,
  locale     TEXT,
  status     TEXT NOT NULL DEFAULT 'new'
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX leads_created_idx ON leads (created_at DESC);
