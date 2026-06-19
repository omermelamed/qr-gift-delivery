-- Link gift_tokens to their canonical employee record
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gift_tokens_employee_id_idx ON gift_tokens (employee_id);

-- Backfill: match existing tokens to employees by name + company
UPDATE gift_tokens gt
SET employee_id = e.id
FROM employees e
JOIN campaigns c ON c.company_id = e.company_id
WHERE gt.campaign_id = c.id
  AND gt.employee_name = e.employee_name
  AND gt.employee_id IS NULL;
