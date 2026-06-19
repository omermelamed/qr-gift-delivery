import { createServiceClient } from '@/lib/supabase/server'
import type { Permission } from '@/types'

type RolePermissionRow = { permissions: Pick<Permission, 'name'> | null }

const PLATFORM_ADMIN_SENTINEL = ['__platform_admin__'] as const

export async function fetchPermissions(roleId: string | undefined, roleName?: string): Promise<string[]> {
  if (roleName === 'platform_admin') return [...PLATFORM_ADMIN_SENTINEL]

  if (!roleId) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(name)')
    .eq('role_id', roleId)

  if (error || !data) return []
  return (data as unknown as RolePermissionRow[])
    .filter((row) => row.permissions != null)
    .map((row) => row.permissions!.name)
}

export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('__platform_admin__')) return true
  return permissions.includes(required)
}
