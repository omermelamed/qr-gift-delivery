import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { CreditsPageUI } from '@/components/sms/CreditsPageUI'

export default async function CreditsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const [creditsResult, txResult] = await Promise.all([
    service
      .from('credits')
      .select('total_purchased, total_used, balance')
      .eq('company_id', appMeta.company_id)
      .single(),
    service
      .from('credit_transactions')
      .select('id, amount, type, description, created_at')
      .eq('company_id', appMeta.company_id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const credits = creditsResult.data ?? { total_purchased: 0, total_used: 0, balance: 0 }
  const transactions = txResult.data ?? []

  return (
    <CreditsPageUI credits={credits} transactions={transactions} />
  )
}
