import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { PlatformSidebar } from '@/components/platform/PlatformSidebar'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'platform_admin') redirect('/unauthorized')

  return (
    <div className="flex min-h-screen">
      <PlatformSidebar />
      <main className="flex-1 overflow-auto bg-zinc-50">
        {children}
      </main>
    </div>
  )
}
