import { createServiceClient } from '@/lib/supabase/server'
import type { Permission } from '@/types'

type RolePermissionRow = { permissions: Pick<Permission, 'name'> | null }

// Fetches permission names for a role from the DB.
// Used by API routes to gate access without repeating the query.
export async function fetchPermissions(roleId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(name)')
    .eq('role_id', roleId)

  if (error || !data) return []
  return (data as RolePermissionRow[])
    .filter((row) => row.permissions != null)
    .map((row) => row.permissions!.name)
}

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes(required)
}
