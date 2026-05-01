-- Grant company_admin the tokens:scan permission so admins formally
-- have all permissions (previously it was only a code-level bypass).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'company_admin'
  AND p.name = 'tokens:scan'
ON CONFLICT DO NOTHING;
