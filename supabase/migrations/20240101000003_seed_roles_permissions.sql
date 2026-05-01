-- ============================================================
-- System permissions
-- ============================================================
INSERT INTO permissions (name) VALUES
  ('campaigns:read'),
  ('campaigns:create'),
  ('campaigns:launch'),
  ('users:manage'),
  ('tokens:scan'),
  ('reports:export');

-- ============================================================
-- System roles (company_id = NULL means platform-level)
-- ============================================================
INSERT INTO roles (name, is_system, company_id) VALUES
  ('platform_admin',    TRUE, NULL),
  ('company_admin',     TRUE, NULL),
  ('campaign_manager',  TRUE, NULL),
  ('scanner',           TRUE, NULL);

-- ============================================================
-- Role → Permission assignments
-- ============================================================

-- platform_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'platform_admin';

-- company_admin: all except tokens:scan
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'company_admin'
  AND p.name IN ('campaigns:read','campaigns:create','campaigns:launch','users:manage','reports:export');

-- campaign_manager: campaigns + reports, no user management or scanning
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'campaign_manager'
  AND p.name IN ('campaigns:read','campaigns:create','campaigns:launch','reports:export');

-- scanner: only scan
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'scanner'
  AND p.name = 'tokens:scan';
