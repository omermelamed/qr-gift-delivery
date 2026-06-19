import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { ResultCard } from '@/components/verify/ResultCard'

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated — send to login, come back here after
  if (!user) {
    redirect(`/login?next=/verify/${token}`)
  }

  const meta = user.app_metadata as JwtAppMetadata | undefined
  const canScan = meta?.role_name === 'platform_admin' || meta?.role_name === 'scanner' || meta?.role_name === 'company_admin'

  // Logged in but not a scanner — redirect to admin or show not authorized
  if (!canScan) {
    redirect('/admin')
  }

  // Perform verification server-side
  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, campaigns(closed_at, company_id)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return <ResultCard icon="✗" color="red" title="Invalid QR code" subtitle="This code doesn't exist." />
  }

  const campaign = tokenRow.campaigns as unknown as { closed_at: string | null; company_id: string } | null

  if (campaign?.closed_at) {
    return <ResultCard icon="✗" color="red" title="Campaign closed" subtitle="No further gifts can be claimed." />
  }

  if (tokenRow.redeemed) {
    return (
      <ResultCard
        icon="✗"
        color="red"
        title="Already claimed"
        subtitlePrefix={tokenRow.employee_name}
        subtitle="already redeemed this gift."
      />
    )
  }

  // Distributor restriction check
  const { data: assignedDistributors } = await service
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', tokenRow.campaign_id)

  if (assignedDistributors && assignedDistributors.length > 0) {
    const assignedIds = new Set(assignedDistributors.map((r) => r.user_id))
    if (!assignedIds.has(user.id)) {
      // Check if admin
      const companyId = campaign?.company_id
      const { data: adminRole } = companyId
        ? await service
            .from('user_company_roles')
            .select('roles!inner(name)')
            .eq('user_id', user.id)
            .eq('company_id', companyId)
            .eq('roles.name', 'company_admin')
            .maybeSingle()
        : { data: null }

      if (!adminRole) {
        return (
          <ResultCard
            icon="✗"
            color="red"
            title="Not authorised"
            subtitle="You are not assigned to this campaign."
          />
        )
      }
    }
  }

  // Atomic redemption
  const { data: redeemed } = await service
    .from('gift_tokens')
    .update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by: user.id,
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    return (
      <ResultCard
        icon="✓"
        color="green"
        title={redeemed.employee_name}
        subtitle="Gift collected!"
        rawTitle
      />
    )
  }

  // Race: already redeemed between our check and write
  return <ResultCard icon="✗" color="red" title="Already claimed" subtitle="This gift was just redeemed." />
}
