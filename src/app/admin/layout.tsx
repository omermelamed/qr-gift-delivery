import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { Sidebar } from '@/components/admin/Sidebar'
import { IMPERSONATE_COOKIE } from '@/app/api/platform/impersonate/route'

const ADMIN_ROLES: JwtAppMetadata['role_name'][] = ['company_admin', 'campaign_manager']
const DEFAULT_BRAND = '#6366f1'

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
  } else {
    redirect('/unauthorized')
  }

  const service = createServiceClient()
  let company: { name?: string | null; logo_url?: string | null; theme_color?: string | null } | null = null
  try {
    const { data } = await service
      .from('companies')
      .select('name, logo_url, theme_color')
      .eq('id', companyId)
      .single()
    company = data
  } catch {
    // columns not yet present — ignore
  }

  const brand = company?.theme_color ?? DEFAULT_BRAND

  return (
    <div className="flex flex-col min-h-screen" style={{ '--brand': brand } as React.CSSProperties}>
      <style>{`
        :root { --brand: ${brand}; }
      `}</style>
      {isPlatformAdmin && (
        <div className="bg-violet-600 text-white text-sm px-4 py-2 flex items-center justify-between z-50">
          <span>
            Viewing as platform admin{company?.name ? <> — <strong>{company.name}</strong></> : null}
          </span>
          <a
            href="/platform"
            className="text-white/90 hover:text-white font-medium underline underline-offset-2 transition-colors"
          >
            ← Back to Platform
          </a>
        </div>
      )}
      <div className="flex flex-1">
        <Sidebar logoUrl={company?.logo_url ?? undefined} />
        <main className="flex-1 overflow-auto bg-zinc-50 pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
