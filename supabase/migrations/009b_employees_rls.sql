ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_company_isolation"
  ON employees
  FOR ALL
  USING (company_id = public.jwt_company_id())
  WITH CHECK (company_id = public.jwt_company_id());
