'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

type Campaign = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
  total: number
  redeemed: number
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
                href={`/scan/campaigns/${c.id}`}
                className="bg-white rounded-2xl border border-zinc-200 p-5 flex items-center justify-between hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900">{c.name}</p>
                  {c.campaign_date && (
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {new Date(c.campaign_date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                  )}
                  {c.total > 0 && (
                    <div className="mt-2 w-40 max-w-full">
                      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                        <span>{c.redeemed} / {c.total} {t('claimed')}</span>
                        <span>{Math.round((c.redeemed / c.total) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                          style={{ width: `${(c.redeemed / c.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-indigo-600 flex-shrink-0 ms-3" aria-hidden>→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
