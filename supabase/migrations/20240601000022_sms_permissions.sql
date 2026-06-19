-- SMS SaaS permissions
INSERT INTO permissions (name) VALUES
  ('credits:purchase'),
  ('credits:read'),
  ('sms_campaigns:read'),
  ('sms_campaigns:create'),
  ('sms_campaigns:send'),
  ('templates:read'),
  ('templates:manage');

-- platform_admin: gets all new permissions automatically (already has wildcard insert)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'platform_admin'
  AND p.name IN ('credits:purchase','credits:read','sms_campaigns:read','sms_campaigns:create','sms_campaigns:send','templates:read','templates:manage');

-- company_admin: full SMS access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'company_admin'
  AND p.name IN ('credits:purchase','credits:read','sms_campaigns:read','sms_campaigns:create','sms_campaigns:send','templates:read','templates:manage');

-- campaign_manager: can use SMS but not purchase credits
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'campaign_manager'
  AND p.name IN ('credits:read','sms_campaigns:read','sms_campaigns:create','sms_campaigns:send','templates:read','templates:manage');
