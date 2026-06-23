// Single source of truth for where a signed-in user lands, shared by the
// password sign-in flow and the Google OAuth callback so they cannot drift.
export function defaultPathForRole(roleName?: string): string {
  if (roleName === 'scanner') return '/scan/campaigns'
  if (roleName === 'platform_admin') return '/platform'
  return '/admin'
}
