-- Allow employees to exist without a phone (team member sync)
ALTER TABLE employees ALTER COLUMN phone DROP NOT NULL;

-- Link employees to their auth user when they're team members
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Prevent duplicate team member rows per company
CREATE UNIQUE INDEX IF NOT EXISTS employees_company_user_idx
  ON employees (company_id, user_id)
  WHERE user_id IS NOT NULL;
