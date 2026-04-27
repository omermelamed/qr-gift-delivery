import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'scanner') redirect('/login')

  return <>{children}</>
}
