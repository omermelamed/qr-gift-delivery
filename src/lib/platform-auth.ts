import { cookies } from 'next/headers'
import { IMPERSONATE_COOKIE } from '@/app/api/platform/impersonate/route'
import type { JwtAppMetadata } from '@/types'

/**
 * Resolve the effective company_id for the current user.
 * Platform admins use the impersonation cookie; regular admins use their JWT metadata.
 * Returns null if the user has no valid company context.
 */
export async function resolveCompanyId(meta: JwtAppMetadata | undefined): Promise<string | null> {
  if (meta?.role_name === 'platform_admin') {
    const jar = await cookies()
    return jar.get(IMPERSONATE_COOKIE)?.value ?? null
  }
  return meta?.company_id ?? null
}

export function isPlatformAdmin(meta: JwtAppMetadata | undefined): boolean {
  return meta?.role_name === 'platform_admin'
}
