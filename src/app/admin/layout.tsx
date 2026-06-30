import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { Sidebar } from '@/components/admin/Sidebar'
import { IMPERSONATE_COOKIE } from '@/app/api/platform/impersonate/route'

const ADMIN_ROLES: JwtAppMetadata['role_name'][] = ['company_admin', 'campaign_manager']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata | undefined

  let companyId: string | undefined
  const isPlatformAdmin = meta?.role_name === 'platform_admin'

  if (isPlatformAdmin) {
    const jar = await cookies()
    companyId = jar.get(IMPERSONATE_COOKIE)?.value
    if (!companyId) redirect('/platform')
  } else if (meta?.role_name && ADMIN_ROLES.includes(meta.role_name)) {
    companyId = meta.company_id
  } else if (meta?.role_name === 'scanner') {
    // Scanners have no admin access — send them to their campaigns list, not an error.
    redirect('/scan/campaigns')
  } else {
    redirect('/unauthorized')
  }

  const service = createServiceClient()
  let company: { name?: string | null; logo_url?: string | null } | null = null
  try {
    const { data } = await service
      .from('companies')
      .select('name, logo_url')
      .eq('id', companyId)
      .single()
    company = data
  } catch {
    // columns not yet present — ignore
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <style>{`
        html, body { overflow: hidden; height: 100%; }
      `}</style>
      {isPlatformAdmin && (
        <div className="bg-violet-600 text-white text-sm px-4 py-2 flex items-center justify-between z-50 flex-shrink-0">
          <span>
            Viewing as platform admin{company?.name ? <> — <strong>{company.name}</strong></> : null}
          </span>
          <a
            href="/platform"
            className="text-white/90 hover:text-white font-medium underline underline-offset-2 transition-colors"
          >
            <span className="inline-block rtl:rotate-180">←</span> Back to Platform
          </a>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar logoUrl={company?.logo_url ?? undefined} />
        <main className="flex-1 min-h-0 overflow-y-auto bg-zinc-50 pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
