import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { GiftRedemptionView } from '@/components/gift/GiftRedemptionView'
import { decodeToken } from '@/lib/short-token'

export default async function GiftQrPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token: param } = await params
  // SMS links carry the short base64url form; older links carry the raw UUID.
  // Decode once here and thread the canonical UUID through the rest of the flow.
  const token = decodeToken(param)
  if (!token) return notFound()

  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('employee_name, redeemed, qr_image_url, gift_id, campaign_id, attending, attendee_count, campaigns(name, supports_arrival_certificates, max_attendee_count, allow_gift_if_not_attending, rsvp_locked)')
    .eq('token', token)
    .single()

  if (!tokenRow) return notFound()

  const campaign = tokenRow.campaigns as unknown as {
    name: string
    supports_arrival_certificates: boolean
    max_attendee_count: number | null
    allow_gift_if_not_attending: boolean
    rsvp_locked: boolean
  } | null
  const supportsArrival = campaign?.supports_arrival_certificates ?? false
  const maxCount = campaign?.max_attendee_count ?? null
  const allowGiftIfNotAttending = campaign?.allow_gift_if_not_attending ?? false
  const rsvpLocked = campaign?.rsvp_locked ?? false

  if (tokenRow.redeemed) {
    return (
      <GiftRedemptionView
        token={token}
        employeeName={tokenRow.employee_name}
        campaignName={campaign?.name ?? null}
        redeemed
        qrImageUrl={null}
        gifts={[]}
        needsChoice={false}
        chosenGiftName={null}
        supportsArrival={supportsArrival}
        attending={tokenRow.attending}
        attendeeCount={tokenRow.attendee_count}
        maxCount={maxCount}
        allowGiftIfNotAttending={allowGiftIfNotAttending}
        rsvpLocked={rsvpLocked}
      />
    )
  }

  const { data: giftRows } = await service
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', tokenRow.campaign_id)
    .order('position', { ascending: true })

  const gifts = giftRows ?? []
  const isMultiGift = gifts.length >= 2
  const needsChoice = isMultiGift && !tokenRow.gift_id
  const chosenGift = tokenRow.gift_id ? gifts.find((g) => g.id === tokenRow.gift_id) ?? null : null

  return (
    <GiftRedemptionView
      token={token}
      employeeName={tokenRow.employee_name}
      campaignName={campaign?.name ?? null}
      redeemed={false}
      qrImageUrl={tokenRow.qr_image_url}
      gifts={gifts.map((g) => ({ id: g.id, name: g.name }))}
      needsChoice={needsChoice}
      chosenGiftName={chosenGift?.name ?? null}
      supportsArrival={supportsArrival}
      attending={tokenRow.attending}
      attendeeCount={tokenRow.attendee_count}
      maxCount={maxCount}
      allowGiftIfNotAttending={allowGiftIfNotAttending}
      rsvpLocked={rsvpLocked}
    />
  )
}
