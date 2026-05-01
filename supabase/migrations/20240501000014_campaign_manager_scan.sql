INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'campaign_manager'
  AND p.name = 'tokens:scan'
ON CONFLICT DO NOTHING;
