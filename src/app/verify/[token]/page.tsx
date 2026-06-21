import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ResultCard } from '@/components/verify/ResultCard'
import { VerifyGiftPicker } from '@/components/verify/VerifyGiftPicker'
import { verifyAndRedeem } from '@/lib/verify-redemption'
import type { JwtAppMetadata } from '@/types'

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

  // Same verification + redemption path the camera scanner uses, so both scan
  // surfaces behave identically (authorization, gift resolution, atomic write).
  const outcome = await verifyAndRedeem(token, {
    id: user.id,
    app_metadata: user.app_metadata as JwtAppMetadata | undefined,
  })

  if (outcome.valid && 'needsGiftSelection' in outcome) {
    return (
      <VerifyGiftPicker
        token={token}
        employeeName={outcome.employeeName}
        gifts={outcome.gifts}
      />
    )
  }

  if (outcome.valid) {
    return (
      <ResultCard
        icon="✓"
        color="green"
        title={outcome.employeeName}
        subtitle="Gift collected!"
        rawTitle
        giftName={outcome.giftName}
      />
    )
  }

  switch (outcome.reason) {
    case 'campaign_closed':
      return <ResultCard icon="✗" color="red" title="Campaign closed" subtitle="No further gifts can be claimed." />
    case 'not_authorized':
      return <ResultCard icon="✗" color="red" title="Not authorised" subtitle="You are not assigned to this campaign." />
    case 'already_used':
      return (
        <ResultCard
          icon="✗"
          color="red"
          title="Already claimed"
          subtitlePrefix={outcome.employeeName}
          subtitle="already redeemed this gift."
          giftName={outcome.giftName}
        />
      )
    case 'invalid':
      return <ResultCard icon="✗" color="red" title="Invalid QR code" subtitle="This code doesn't exist." />
    default:
      return <ResultCard icon="✗" color="red" title="Could not verify" subtitle="Try again" />
  }
}
