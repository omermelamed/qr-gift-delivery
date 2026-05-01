CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  department    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS employees_company_idx ON employees (company_id);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_company_isolation"
  ON employees
  FOR ALL
  USING (company_id = public.jwt_company_id())
  WITH CHECK (company_id = public.jwt_company_id());
