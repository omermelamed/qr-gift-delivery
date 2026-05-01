import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const meta = user.app_metadata as JwtAppMetadata | undefined
  const allowed = meta?.role_name === 'scanner' || meta?.role_name === 'company_admin' || meta?.role_name === 'campaign_manager'
  if (!allowed) redirect('/unauthorized')

  return <>{children}</>
}
