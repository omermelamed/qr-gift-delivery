'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

type Campaign = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
}

export default function ScannerCampaignsPage() {
  const t = useT()
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []))
      .catch(() => setCampaigns([]))
  }, [])

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">{t('My Campaigns')}</h1>
          <Link
            href="/scan"
            className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg px-3 py-2 hover:brightness-110 transition-all"
          >
            {t('Open scanner')}
          </Link>
        </div>

        {campaigns === null ? (
          <p className="text-sm text-zinc-400 text-center py-12">{t('Loading…')}</p>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200">
            <p className="text-sm text-zinc-500">{t('No campaigns assigned to you yet.')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href="/scan"
                className="bg-white rounded-2xl border border-zinc-200 p-5 flex items-center justify-between hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{c.name}</p>
                  {c.campaign_date && (
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {new Date(c.campaign_date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                  )}
                </div>
                <span className="text-sm font-medium text-indigo-600 flex-shrink-0">{t('Scan')} →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
