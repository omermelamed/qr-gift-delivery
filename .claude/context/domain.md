# Domain context

## Multi-tenancy model

This is a hosted SaaS. Multiple companies sign up and share one Supabase project. Data is isolated by `company_id` enforced at the RLS level — Company A can never see Company B's data regardless of application-layer bugs.

## Roles

| Role | Scope | Permissions |
|---|---|---|
| `platform_admin` | Global (you) | Manage companies, bypass all company isolation |
| `company_admin` | Their company | Manage users, campaigns, reports, full company access |
| `campaign_manager` | Their company | Create/launch campaigns, view reports — no user management |
| `scanner` | Their company | Scan QR codes only |

Roles are stored in the DB (`roles` table). Permissions are named actions stored in the `permissions` table and linked to roles via `role_permissions`.

## JWT shape

```json
{
  "app_metadata": {
    "company_id": "uuid",
    "role_id": "uuid",
    "role_name": "company_admin"
  }
}
```

- `company_id` → used by RLS for data isolation
- `role_id` → used by middleware to fetch permissions from DB
- `role_name` → used by RLS to allow `platform_admin` bypass

## Permission check flow (per request)

1. JWT arrives with `company_id`, `role_id`, `role_name`
2. RLS enforces company isolation automatically at the DB level
3. API route middleware calls `fetchPermissions(roleId)` → returns `string[]` of permission names
4. Route checks required permission: `requirePermission('campaigns:create')`
5. Permission set is cached per request (no repeated queries)

## System permissions

| Permission | Who has it |
|---|---|
| `campaigns:read` | company_admin, campaign_manager |
| `campaigns:create` | company_admin, campaign_manager |
| `campaigns:launch` | company_admin, campaign_manager |
| `users:manage` | company_admin |
| `tokens:scan` | scanner |
| `reports:export` | company_admin, campaign_manager |

## Core entities

**Company** — a tenant. All data belongs to a company.

**Campaign** — a named holiday gift event (e.g., "Passover 2026"), scoped to a company.

**GiftToken** — one row per employee per campaign. Contains the unique `token` UUID (the QR payload), SMS delivery status, and redemption state. This is the source of truth.

**Role / Permission / RolePermission / UserCompanyRole** — the permissions infrastructure.

## Hard invariants

- `token` is a UUID — unguessable, unique globally
- `redeemed = true` is set exactly once — the first successful scan wins
- the verify endpoint write must be atomic (`UPDATE ... WHERE redeemed = false RETURNING *`)
- `sms_sent_at` is written only after Twilio confirms the message was accepted
- the service-role key is only used server-side, never exposed to the browser
- `company_id` in JWT is set server-side via service-role client and cannot be changed by the user

## URL structure

- `/verify/[token]` — public landing (no auth)
- `/scan` — scanner camera page (authenticated, requires `tokens:scan`)
- `/admin` — company admin root (authenticated)
- `/admin/campaigns/new` — campaign creation (requires `campaigns:create`)
- `/admin/campaigns/[id]` — campaign detail, launch, live dashboard
- `/api/verify/[token]` — token validation API (POST)
- `/api/campaigns/[id]/send` — launch SMS blast (POST, requires `campaigns:launch`)
- `/api/generate-qr` — generate and store QR image (POST)

## Database schema

```sql
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, name)
);

CREATE TABLE permissions (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_company_roles (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

CREATE TABLE gift_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  employee_name  TEXT NOT NULL,
  phone_number   TEXT NOT NULL,
  token          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  qr_image_url   TEXT,
  sms_sent_at    TIMESTAMPTZ,
  redeemed       BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at    TIMESTAMPTZ,
  redeemed_by    UUID REFERENCES auth.users ON DELETE SET NULL,
  CONSTRAINT redeemed_consistency CHECK (
    (redeemed = FALSE AND redeemed_at IS NULL AND redeemed_by IS NULL) OR
    (redeemed = TRUE AND redeemed_at IS NOT NULL)
  )
);
```

## Cost envelope

~$41 per campaign (2,000 Twilio MMS at ~$0.02 each). Vercel and Supabase are free tier.
