'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { InfoIcon } from '@/components/icons'

type Distributor = { userId: string; name: string; email: string }
type ScannerUser = { id: string; name: string; email: string }

export function DistributorAssignment({ campaignId }: { campaignId: string }) {
  const t = useT()
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [scanners, setScanners] = useState<ScannerUser[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/distributors`)
      .then((r) => r.json())
      .then((data) => setDistributors(data.distributors ?? []))
  }, [campaignId])

  async function loadScanners() {
    const res = await fetch('/api/team/scanners')
    if (res.ok) {
      const json = await res.json()
      setScanners(json.scanners ?? [])
    }
  }

  async function handleAdd(scanner: ScannerUser) {
    setShowPicker(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/distributors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: scanner.id }),
      })
      if (res.ok) {
        setDistributors((prev) => [...prev, { userId: scanner.id, name: scanner.name, email: scanner.email }])
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(userId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/distributors/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      setDistributors((prev) => prev.filter((d) => d.userId !== userId))
    }
  }

  const assignedIds = new Set(distributors.map((d) => d.userId))
  const availableScanners = scanners.filter((s) => !assignedIds.has(s.id))

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <h2 className="font-semibold text-zinc-900">{t('Scanners')}</h2>
        <span className="group relative inline-flex items-center">
          <button
            type="button"
            aria-label={t('How to add a scanner')}
            className="text-zinc-300 hover-brand-text transition-colors focus:outline-none cursor-pointer"
          >
            <InfoIcon className="w-4 h-4" />
          </button>
          {/* pt-1.5 bridges the gap to the icon so moving the cursor into the
              bubble keeps it open (so the link stays clickable). */}
          <span className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-1/2 top-full z-20 w-56 -translate-x-1/2 pt-1.5">
            <span className="block rounded-lg bg-zinc-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg">
              {t('To add a new scanner, go to the')}{' '}
              <Link href={`/admin/team?back=${encodeURIComponent(`/admin/campaigns/${campaignId}`)}`} className="underline font-medium hover:text-white">{t('Team screen')}</Link>
            </span>
          </span>
        </span>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        {distributors.length === 0
          ? t('Any scanner can scan this campaign')
          : `${distributors.length} ${t('assigned')}`}
      </p>

      {distributors.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {distributors.map((d) => (
            <li key={d.userId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{d.name}</p>
                <p className="text-xs text-zinc-400 truncate">{d.email}</p>
              </div>
              <button
                onClick={() => handleRemove(d.userId)}
                aria-label={`Remove ${d.name}`}
                className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <button
          onClick={() => { setShowPicker(true); loadScanners() }}
          disabled={loading}
          className="text-sm font-medium text-brand hover-brand-text transition-colors disabled:opacity-50"
        >
          {t('+ Add scanner')}
        </button>

        {showPicker && (
          <div className="absolute top-6 start-0 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg p-2 w-64">
            {availableScanners.length === 0 ? (
              <p className="text-sm text-zinc-400 px-2 py-1">{t('No available scanners')}</p>
            ) : (
              availableScanners.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAdd(s)}
                  className="w-full text-start px-3 py-2 rounded-lg hover-brand transition-colors"
                >
                  <p className="text-sm font-medium text-zinc-800">{s.name}</p>
                  <p className="text-xs text-zinc-400">{s.email}</p>
                </button>
              ))
            )}
            <button
              onClick={() => setShowPicker(false)}
              className="w-full text-center text-xs text-zinc-400 mt-1 pt-1 border-t border-zinc-100 hover-brand-text"
            >
              {t('Cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
