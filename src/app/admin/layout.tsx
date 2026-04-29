import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { Sidebar } from '@/components/admin/Sidebar'

const ADMIN_ROLES: JwtAppMetadata['role_name'][] = ['company_admin', 'campaign_manager']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (!meta?.role_name || !ADMIN_ROLES.includes(meta.role_name)) redirect('/login')

  const service = createServiceClient()
  let company: { logo_url?: string | null } | null = null
  try {
    const { data } = await service
      .from('companies')
      .select('logo_url')
      .eq('id', meta.company_id)
      .single()
    company = data
  } catch {
    // migration 006 not yet applied — logo_url column absent, gracefully ignore
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar logoUrl={company?.logo_url ?? undefined} />
      <main className="flex-1 overflow-auto bg-zinc-50">
        {children}
      </main>
    </div>
  )
}
