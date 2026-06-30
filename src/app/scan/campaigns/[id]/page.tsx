'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/browser'
import { CampaignNotes } from '@/components/admin/CampaignNotes'
import { useT } from '@/lib/i18n/useT'

export default function ScannerCampaignDetailPage() {
  const t = useT()
  const params = useParams()
  const campaignId = String(params.id)
  const [userId, setUserId] = useState<string | null>(null)
  const [campaignName, setCampaignName] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((d) => {
        const c = (d.campaigns ?? []).find((x: { id: string }) => x.id === campaignId)
        setCampaignName(c?.name ?? null)
      })
      .catch(() => {})
  }, [campaignId])

  return (
    <main className="flex flex-col bg-zinc-50" style={{ height: '100dvh' }}>
      <div className="px-4 py-3 border-b border-zinc-200 bg-white flex items-center justify-between gap-2 flex-shrink-0">
        <Link href="/scan/campaigns" className="text-sm text-zinc-400 hover-brand-text transition-colors">
          <span className="inline-block rtl:rotate-180">←</span> {t('My Campaigns')}
        </Link>
        <Link
          href="/scan"
          className="text-sm font-semibold text-white bg-brand rounded-lg px-3 py-1.5 hover:brightness-110 transition-all"
        >
          {t('Open scanner')}
        </Link>
      </div>

      {campaignName && (
        <h1 className="px-4 pt-4 pb-1 text-lg font-bold text-zinc-900 flex-shrink-0">{campaignName}</h1>
      )}

      <div className="flex-1 min-h-0 p-4">
        {userId && <CampaignNotes campaignId={campaignId} currentUserId={userId} />}
      </div>
    </main>
  )
}
