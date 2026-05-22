'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { isBatchDuplicate, getBatchSummary, playSuccess, playError } from '@/lib/batch-scan'
import { QrScanner } from '@/components/QrScanner'
import { createClient } from '@/lib/supabase/browser'
import { useT } from '@/lib/i18n/useT'
import type { TokenVerifyResult, GiftOption, ScanOutcome, ScanHistoryEntry } from '@/types'

type ScanState = 'scanning' | 'loading' | 'gift_selection' | 'result'

const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

function outcomeFromResult(result: TokenVerifyResult): ScanOutcome {
  if (result.valid) return 'success'
  if (result.reason === 'already_used') return 'already_claimed'
  if (result.reason === 'campaign_closed') return 'closed'
  if (result.reason === 'not_authorized') return 'not_authorized'
  return 'invalid'
}

function BatchScanList({ entries, t }: { entries: ScanHistoryEntry[]; t: (key: string) => string }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-800 overflow-y-auto flex-1">
      {entries.length === 0 && (
        <li className="flex items-center justify-center py-10 text-zinc-500 text-sm">
          {t('Ready to scan')}
        </li>
      )}
      {entries.map((entry, i) => (
        <li
          key={`${entry.timestamp.getTime()}-${i}`}
          className="flex items-center gap-3 px-4 py-3"
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              entry.outcome === 'success'
                ? 'bg-green-500/20'
                : entry.outcome === 'already_claimed'
                ? 'bg-amber-500/20'
                : 'bg-red-500/20'
            }`}
          >
            {entry.outcome === 'success' ? (
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : entry.outcome === 'already_claimed' ? (
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {entry.employeeName ??
                (entry.outcome === 'invalid' ? t('Invalid QR code') :
                 entry.outcome === 'closed' ? t('Campaign closed') :
                 entry.outcome === 'not_authorized' ? t('Not authorised') : t('Unknown'))}
            </p>
            <p className="text-xs text-zinc-400">
              {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <span
            className={`text-xs font-medium flex-shrink-0 ${
              entry.outcome === 'success'
                ? 'text-green-400'
                : entry.outcome === 'already_claimed'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {entry.outcome === 'success'
              ? t('Claimed')
              : entry.outcome === 'already_claimed'
              ? t('Already claimed')
              : entry.outcome === 'closed'
              ? t('Closed')
              : entry.outcome === 'not_authorized'
              ? t('Not auth.')
              : t('Invalid')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function BatchSummaryModal({
  entries,
  onDone,
  t,
}: {
  entries: ScanHistoryEntry[]
  onDone: () => void
  t: (key: string) => string
}) {
  const summary = getBatchSummary(entries)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6">
      <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white text-xl font-bold text-center mb-6">{t('Session complete')}</h2>
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-green-400 text-sm font-medium">
              <span>✅</span>{t('Claimed')}
            </span>
            <span className="text-white font-bold text-lg">{summary.claimed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <span>⚠️</span>{t('Already claimed')}
            </span>
            <span className="text-white font-bold text-lg">{summary.alreadyClaimed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-red-400 text-sm font-medium">
              <span>❌</span>{t('Invalid')}
            </span>
            <span className="text-white font-bold text-lg">{summary.invalid}</span>
          </div>
          <div className="h-px bg-zinc-700 my-1" />
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">{t('Total scanned')}</span>
            <span className="text-white font-bold text-lg">{summary.total}</span>
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
        >
          {t('Done')}
        </button>
      </div>
    </div>
  )
}

export default function ScanPage() {
  const t = useT()
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // Multi-gift state
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [pendingEmployee, setPendingEmployee] = useState<string | null>(null)
  const [giftOptions, setGiftOptions] = useState<GiftOption[]>([])
  const [giftLoading, setGiftLoading] = useState(false)
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [showBatchSummary, setShowBatchSummary] = useState(false)
  const [batchToast, setBatchToast] = useState<string | null>(null)
  const lastScannedRef = useRef<{ token: string; time: number } | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const handleScan = useCallback(
    async (text: string) => {
      if (scanState !== 'scanning') return
      setScanState('loading')

      const match = text.match(TOKEN_PATTERN)
      if (!match) {
        const entry: ScanHistoryEntry = { employeeName: null, outcome: 'invalid', timestamp: new Date() }
        if (isBatchMode) {
          if (isBatchDuplicate(lastScannedRef.current, 'invalid', Date.now())) {
            setScanState('scanning')
            return
          }
          lastScannedRef.current = { token: 'invalid', time: Date.now() }
          setScanHistory((prev) => [entry, ...prev])
          playError()
          setScanState('scanning')
        } else {
          setResult({ valid: false, reason: 'invalid' })
          setScanHistory((prev) => [entry, ...prev].slice(0, 10))
          setScanState('result')
        }
        return
      }

      const token = match[1]

      if (isBatchMode && isBatchDuplicate(lastScannedRef.current, token, Date.now())) {
        setScanState('scanning')
        return
      }

      let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        r = await res.json()
      } catch {
        r = { valid: false, reason: 'invalid' }
      }

      // Multi-gift guard: exit batch mode and hand off to gift selection flow
      if (r.valid && r.needsGiftSelection) {
        if (isBatchMode) {
          setIsBatchMode(false)
          setBatchToast(t('Batch mode paused — gift selection required'))
          setTimeout(() => setBatchToast(null), 3000)
        }
        setPendingToken(token)
        setPendingEmployee(r.employeeName)
        setGiftOptions(r.gifts)
        setScanState('gift_selection')
        return
      }

      const employeeName = r.valid
        ? r.employeeName
        : r.reason === 'already_used'
        ? r.employeeName
        : null
      const outcome = outcomeFromResult(r)
      const entry: ScanHistoryEntry = { employeeName, outcome, timestamp: new Date() }

      if (isBatchMode) {
        lastScannedRef.current = { token, time: Date.now() }
        setScanHistory((prev) => [entry, ...prev])
        outcome === 'success' ? playSuccess() : playError()
        setScanState('scanning')
      } else {
        setResult(r)
        setScanHistory((prev) => [entry, ...prev].slice(0, 10))
        setScanState('result')
      }
    },
    [scanState, userId, isBatchMode]
  )

  async function handleGiftSelect(giftId: string) {
    if (!pendingToken) return
    setGiftLoading(true)
    let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
    try {
      const res = await fetch(`/api/verify/${pendingToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId }),
      })
      r = await res.json()
    } catch {
      r = { valid: false, reason: 'invalid' }
    }
    setGiftLoading(false)
    const employeeName = r.valid ? r.employeeName : (r.reason === 'already_used' ? r.employeeName : null)
    setScanHistory((prev) => [{
      employeeName: employeeName ?? pendingEmployee,
      outcome: outcomeFromResult(r),
      timestamp: new Date(),
    }, ...prev].slice(0, 10))
    setPendingToken(null)
    setPendingEmployee(null)
    setGiftOptions([])
    setResult(r)
    setScanState('result')
  }

  function handleDismiss() {
    setResult(null)
    setScanState('scanning')
  }

  function handleCancelGift() {
    setPendingToken(null)
    setPendingEmployee(null)
    setGiftOptions([])
    setScanState('scanning')
  }

  function handleEndSession() {
    setShowBatchSummary(true)
  }

  function handleDoneSummary() {
    setScanHistory([])
    lastScannedRef.current = null
    setIsBatchMode(false)
    setShowBatchSummary(false)
  }

  return (
    <main className="flex flex-col bg-black overflow-hidden" style={{ height: '100dvh' }}>
      <div className="relative flex-1 overflow-hidden">

        {/* Camera — full screen in single mode, top 45% in batch mode */}
        <div className={isBatchMode ? 'absolute inset-x-0 top-0 h-[45%]' : 'absolute inset-0'}>
          <QrScanner onResult={handleScan} active={scanState === 'scanning' && userId !== null} />
        </div>

        {/* ── BATCH MODE ── */}
        {isBatchMode && (
          <div className="absolute inset-x-0 bottom-0 top-[45%] flex flex-col bg-zinc-950">
            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-indigo-900/60 border-b border-indigo-700/40">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-indigo-300 text-xs font-semibold uppercase tracking-widest">
                  {t('Batch Mode')}
                </span>
              </div>
              <span className="text-zinc-400 text-xs">
                {scanHistory.length} {t('scanned')}
              </span>
            </div>

            {/* Loading spinner between scans */}
            {scanState === 'loading' && (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Running list */}
            <BatchScanList entries={scanHistory} t={t} />

            {/* End session */}
            <div className="px-4 py-3 border-t border-zinc-800">
              <button
                onClick={handleEndSession}
                className="w-full py-3 bg-red-900/40 hover:bg-red-800/50 border border-red-700/40 text-red-400 font-semibold rounded-xl transition-colors text-sm"
              >
                {t('End Session')}
              </button>
            </div>
          </div>
        )}

        {/* ── SINGLE SCAN MODE ── */}
        {!isBatchMode && (
          <>
            {/* Scan frame */}
            {scanState === 'scanning' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="relative w-52 h-52">
                  <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                  <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
                  <span className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan-line" style={{ top: '50%' }} />
                </div>
                <p className="text-white/50 text-sm mt-6">{t('Point camera at QR code')}</p>
              </div>
            )}

            {/* Loading overlay */}
            {scanState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Gift selection */}
            {scanState === 'gift_selection' && (
              <div className="absolute inset-0 flex flex-col bg-zinc-900 px-6 pt-12 pb-8">
                <p className="text-white/60 text-sm text-center mb-1">{t('Scanning for')}</p>
                <p className="text-white text-2xl font-bold text-center mb-8">{pendingEmployee}</p>
                <p className="text-white/80 text-sm font-medium text-center mb-4">{t('Which gift did they take?')}</p>
                <div className="flex flex-col gap-3 flex-1">
                  {giftOptions.map((gift, i) => (
                    <button
                      key={gift.id}
                      onClick={() => handleGiftSelect(gift.id)}
                      disabled={giftLoading}
                      className="w-full py-5 rounded-2xl text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform"
                      style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
                    >
                      {gift.name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleCancelGift}
                  disabled={giftLoading}
                  className="mt-6 text-white/40 text-sm text-center w-full"
                >
                  {t('Cancel scan')}
                </button>
              </div>
            )}

            {/* Result takeover */}
            {scanState === 'result' && result && (
              <div
                onClick={handleDismiss}
                className={`absolute inset-0 flex flex-col items-center justify-center gap-5 cursor-pointer select-none ${
                  result.valid ? 'bg-green-600' : 'bg-red-600'
                }`}
              >
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-4xl">{result.valid ? '✓' : '✗'}</span>
                </div>
                {result.valid ? (
                  <>
                    <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
                    <p className="text-white/80 text-lg">{t('Gift collected')}</p>
                  </>
                ) : result.reason === 'campaign_closed' ? (
                  <>
                    <p className="text-white text-3xl font-bold">{t('Campaign closed')}</p>
                    <p className="text-white/80 text-lg">{t('No further gifts can be claimed')}</p>
                  </>
                ) : result.reason === 'not_authorized' ? (
                  <>
                    <p className="text-white text-3xl font-bold">{t('Not authorised')}</p>
                    <p className="text-white/80 text-lg">{t('You are not assigned to this campaign')}</p>
                  </>
                ) : result.reason === 'already_used' ? (
                  <>
                    <p className="text-white text-3xl font-bold">{t('Already claimed')}</p>
                    {result.employeeName && (
                      <p className="text-white/80 text-lg">{result.employeeName}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-white text-3xl font-bold">{t('Could not verify')}</p>
                    <p className="text-white/80 text-lg">{t('Try again')}</p>
                  </>
                )}
                <p className="text-white/40 text-sm absolute bottom-10">{t('Tap anywhere to scan next')}</p>
              </div>
            )}

            {/* Back to admin + Batch Mode button + History */}
            {scanState !== 'result' && scanState !== 'gift_selection' && (
              <>
                <a
                  href="/admin"
                  className="absolute top-5 start-5 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
                >
                  {t('← Admin')}
                </a>
                <button
                  onClick={() => setIsBatchMode(true)}
                  className="absolute bottom-8 start-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
                >
                  {t('Batch Mode')}
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="absolute bottom-8 end-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
                >
                  {t('History')} {scanHistory.length > 0 && `(${scanHistory.length})`}
                </button>
              </>
            )}

            {/* History bottom sheet */}
            {showHistory && (
              <div
                className="absolute inset-0 flex flex-col justify-end z-30"
                onClick={() => setShowHistory(false)}
              >
                <div
                  className="bg-zinc-900/95 rounded-t-2xl p-5 max-h-[60vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-semibold">{t('Recent scans')}</h2>
                    <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {scanHistory.length === 0 ? (
                    <p className="text-zinc-400 text-sm text-center py-6">{t('No scans yet this session')}</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {scanHistory.map((entry, i) => (
                        <li key={`${entry.timestamp.getTime()}-${i}`} className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            entry.outcome === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                          }`}>
                            {entry.outcome === 'success' ? (
                              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {entry.employeeName ??
                                (entry.outcome === 'invalid' ? t('Invalid QR code') :
                                 entry.outcome === 'not_authorized' ? t('Not auth.') :
                                 entry.outcome === 'closed' ? t('Campaign closed') : 'Unknown')}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`text-xs font-medium flex-shrink-0 ${
                            entry.outcome === 'success' ? 'text-green-400' :
                            entry.outcome === 'already_claimed' ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {entry.outcome === 'success' ? t('Claimed') :
                             entry.outcome === 'already_claimed' ? t('Already claimed') :
                             entry.outcome === 'closed' ? t('Closed') :
                             entry.outcome === 'not_authorized' ? t('Not auth.') : t('Invalid')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Batch toast — shown briefly when exiting batch mode due to multi-gift */}
        {batchToast && (
          <div className="absolute top-6 inset-x-4 z-50 flex justify-center pointer-events-none">
            <div className="bg-zinc-800 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg">
              {batchToast}
            </div>
          </div>
        )}

        {/* Batch summary modal */}
        {showBatchSummary && (
          <BatchSummaryModal entries={scanHistory} onDone={handleDoneSummary} t={t} />
        )}

      </div>
    </main>
  )
}
