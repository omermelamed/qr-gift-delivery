'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { GiftPicker } from '@/components/gift/GiftPicker'
import { ArrivalRsvp } from '@/components/gift/ArrivalRsvp'

type Gift = { id: string; name: string }

type Props = {
  token: string
  employeeName: string
  campaignName: string | null
  redeemed: boolean
  qrImageUrl: string | null
  gifts: Gift[]
  needsChoice: boolean
  chosenGiftName: string | null
  supportsArrival: boolean
  attending: boolean | null
  attendeeCount: number | null
  maxCount: number | null
  allowGiftIfNotAttending: boolean
}

export function GiftRedemptionView({
  token,
  employeeName,
  campaignName,
  redeemed,
  qrImageUrl,
  gifts,
  needsChoice,
  chosenGiftName,
  supportsArrival,
  attending,
  attendeeCount,
  maxCount,
  allowGiftIfNotAttending,
}: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)

  if (redeemed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-zinc-100 px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#10005;</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-1">{t('Already Claimed')}</h1>
          <p className="text-sm text-zinc-500">{t('This gift has already been redeemed.')}</p>
        </div>
      </main>
    )
  }

  // For arrival-certificate campaigns, the RSVP gates the gift QR — unless the
  // campaign explicitly allows non-attendees to still receive a gift.
  const showRsvpForm = supportsArrival && (attending === null || editing)
  const showNotComing = supportsArrival && attending === false && !allowGiftIfNotAttending && !editing

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-zinc-50 to-[var(--color-success-bg)] px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-1">{employeeName}</h1>
        {campaignName && <p className="text-sm text-zinc-500 mb-6">{campaignName}</p>}

        {showRsvpForm ? (
          <ArrivalRsvp
            token={token}
            initialAttending={attending}
            initialCount={attendeeCount}
            maxCount={maxCount}
            onSubmitted={() => setEditing(false)}
          />
        ) : showNotComing ? (
          <>
            <p className="text-sm font-medium text-zinc-700 mb-2">{t("You marked that you're not coming.")}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-semibold text-brand hover-brand-text"
            >
              {t('Change my answer')}
            </button>
          </>
        ) : needsChoice ? (
          <GiftPicker token={token} gifts={gifts} />
        ) : (
          <>
            {chosenGiftName && (
              <p className="text-sm font-medium text-brand mb-4">
                {t('Your gift')}: {chosenGiftName}
              </p>
            )}
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="Gift QR code"
                width={280}
                height={280}
                className="mx-auto rounded-lg"
              />
            ) : (
              <div className="w-[280px] h-[280px] bg-zinc-100 rounded-lg flex items-center justify-center mx-auto">
                <p className="text-zinc-400 text-sm">{t('QR code not available')}</p>
              </div>
            )}
            <p className="text-sm text-zinc-500 mt-6">
              {t('Show this QR code to a scanner to collect your gift.')}
            </p>
            {supportsArrival && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-4 text-sm font-semibold text-brand hover-brand-text"
              >
                {t('Change my answer')}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
