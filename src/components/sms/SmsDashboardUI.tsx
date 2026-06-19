'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CreditPurchaseModal } from './CreditPurchaseModal'
import { useT } from '@/lib/i18n/useT'
import type { SmsCampaignStatus } from '@/types'

type Campaign = {
  id: string
  name: string
  status: SmsCampaignStatus
  recipients_count: number
  sent_count: number
  failed_count: number
  created_at: string
  sent_at: string | null
}

type Props = {
  credits: { total_purchased: number; total_used: number; balance: number }
  campaigns: Campaign[]
  stats: {
    totalCampaigns: number
    totalRecipients: number
    totalSent: number
    totalFailed: number
    templateCount: number
  }
}

export function SmsDashboardUI({ credits, campaigns, stats }: Props) {
  const t = useT()
  const [showPurchase, setShowPurchase] = useState(false)

  const STATUS_STYLES: Record<SmsCampaignStatus, { label: string; color: string }> = {
    draft:      { label: t('Draft'), color: 'bg-zinc-100 text-zinc-600' },
    validating: { label: t('Validating'), color: 'bg-amber-100 text-amber-700' },
    sending:    { label: t('Sending'), color: 'bg-blue-100 text-blue-700' },
    sent:       { label: t('Sent'), color: 'bg-emerald-100 text-emerald-700' },
    failed:     { label: t('Failed'), color: 'bg-red-100 text-red-700' },
    cancelled:  { label: t('Cancelled'), color: 'bg-zinc-100 text-zinc-500' },
  }

  const usagePct = credits.total_purchased > 0
    ? Math.round((credits.total_used / credits.total_purchased) * 100)
    : 0
  const deliveryRate = stats.totalSent > 0
    ? Math.round((stats.totalSent / (stats.totalSent + stats.totalFailed)) * 100)
    : 0
  const isLowCredits = credits.balance > 0 && credits.balance < 50
  const isNoCredits = credits.balance === 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">{t('SMS Dashboard')}</h1>
        <Link
          href="/admin/sms/campaigns/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {t('+ New Campaign')}
        </Link>
      </div>

      {/* Credit gauge + stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Credit gauge */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">{t('Credits')}</h3>
            <button
              onClick={() => setShowPurchase(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:brightness-110 transition-all"
              style={{ backgroundColor: 'var(--brand, #6366f1)' }}
            >
              {t('Buy More')}
            </button>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-3xl font-bold ${isNoCredits ? 'text-red-600' : isLowCredits ? 'text-amber-600' : 'text-emerald-600'}`}>
              {credits.balance.toLocaleString()}
            </span>
            <span className="text-sm text-zinc-400">{t('remaining')}</span>
          </div>
          {credits.total_purchased > 0 && (
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usagePct}%`,
                  backgroundColor: usagePct > 90 ? '#dc2626' : usagePct > 70 ? '#d97706' : 'var(--brand, #6366f1)',
                }}
              />
            </div>
          )}
          <div className="flex justify-between text-xs text-zinc-400 mt-1.5">
            <span>{credits.total_used.toLocaleString()} {t('used')}</span>
            <span>{credits.total_purchased.toLocaleString()} {t('purchased')}</span>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('Campaigns'), value: stats.totalCampaigns, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
            { label: t('Recipients'), value: stats.totalRecipients, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
            { label: t('Delivered'), value: stats.totalSent, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: t('Delivery Rate'), value: stats.totalSent > 0 ? `${deliveryRate}%` : '—', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Low credit warning */}
      {(isLowCredits || isNoCredits) && credits.total_purchased > 0 && (
        <div className={`border rounded-xl p-4 mb-6 flex items-center justify-between ${isNoCredits ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-3">
            <svg className={`w-5 h-5 ${isNoCredits ? 'text-red-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className={`text-sm font-semibold ${isNoCredits ? 'text-red-800' : 'text-amber-800'}`}>
                {isNoCredits ? t('No credits remaining') : `${credits.balance} ${t('credits left')}`}
              </p>
              <p className={`text-sm ${isNoCredits ? 'text-red-600' : 'text-amber-600'}`}>
                {isNoCredits ? t('Purchase credits to continue sending campaigns.') : t('Consider buying more to avoid interruptions.')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPurchase(true)}
            className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
              isNoCredits
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {t('Buy Credits')}
          </button>
        </div>
      )}

      {/* Quick nav */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/sms/templates" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {t('Message Templates')} ({stats.templateCount})
        </Link>
        <Link href="/admin/sms/credits" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('Transaction History')}
        </Link>
      </div>

      {/* Campaign history */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">{t('All Campaigns')}</h2>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <p className="text-zinc-900 font-semibold mb-1">{t('No SMS campaigns yet')}</p>
          <p className="text-sm text-zinc-500 mb-6">{t('Create your first campaign to start reaching your audience.')}</p>
          <Link
            href="/admin/sms/campaigns/new"
            className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            {t('+ New Campaign')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => {
            const statusStyle = STATUS_STYLES[c.status]
            const hasSendData = c.status === 'sent' || c.status === 'failed'
            const deliveredPct = c.recipients_count > 0 ? Math.round((c.sent_count / c.recipients_count) * 100) : 0

            return (
              <Link
                key={c.id}
                href={`/admin/sms/campaigns/${c.id}`}
                className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                      {c.name}
                    </p>
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {new Date(c.created_at).toLocaleDateString('en-IL', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}{c.recipients_count.toLocaleString()} {t('recipients')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {hasSendData && (
                      <span className="text-xs text-zinc-400">
                        {c.sent_count} {t('sent')}
                        {c.failed_count > 0 && <span className="text-red-400"> · {c.failed_count} {t('failed')}</span>}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyle.color}`}>
                      {statusStyle.label}
                    </span>
                  </div>
                </div>

                {hasSendData && c.recipients_count > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span>{c.sent_count} {t('of')} {c.recipients_count} {t('delivered')}</span>
                      <span>{deliveredPct}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${deliveredPct}%` }}
                      />
                      {c.failed_count > 0 && (
                        <div
                          className="h-full bg-red-400 transition-all"
                          style={{ width: `${(c.failed_count / c.recipients_count) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {showPurchase && <CreditPurchaseModal onClose={() => setShowPurchase(false)} />}
    </div>
  )
}
