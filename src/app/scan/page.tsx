'use client'

import { useState, useCallback, useEffect } from 'react'
import { QrScanner } from '@/components/QrScanner'
import { createClient } from '@/lib/supabase/browser'
import type { TokenVerifyResult } from '@/types'

type ScanState = 'scanning' | 'loading' | 'result'
type ScanOutcome = 'success' | 'already_claimed' | 'invalid' | 'closed' | 'not_authorized'

type ScanHistoryEntry = {
  employeeName: string | null
  outcome: ScanOutcome
  timestamp: Date
}

const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function outcomeFromResult(result: TokenVerifyResult): ScanOutcome {
  if (result.valid) return 'success'
  if (result.reason === 'already_used') return 'already_claimed'
  if (result.reason === 'campaign_closed') return 'closed'
  if (result.reason === 'not_authorized') return 'not_authorized'
  return 'invalid'
}

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

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
        const r: TokenVerifyResult = { valid: false, reason: 'invalid' }
        setResult(r)
        setScanHistory((prev) => [{ employeeName: null, outcome: 'invalid' as ScanOutcome, timestamp: new Date() }, ...prev].slice(0, 10))
        setScanState('result')
        return
      }

      const token = match[1]
      let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: userId }),
        })
        r = await res.json()
      } catch {
        r = { valid: false, reason: 'invalid' }
      }

      const employeeName = r.valid ? r.employeeName : (r.reason === 'already_used' ? r.employeeName : null)
      setScanHistory((prev) => [{
        employeeName: employeeName ?? null,
        outcome: outcomeFromResult(r),
        timestamp: new Date(),
      }, ...prev].slice(0, 10))
      setResult(r)
      setScanState('result')
    },
    [scanState, userId]
  )

  function handleDismiss() {
    setResult(null)
    setScanState('scanning')
  }

  return (
    <main className="flex flex-col min-h-screen bg-black overflow-hidden">
      <div className="relative flex-1">
        {/* Camera */}
        <QrScanner onResult={handleScan} active={scanState === 'scanning' && userId !== null} />

        {/* Scan frame overlay */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-52 h-52">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
              <span className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan-line" style={{ top: '50%' }} />
            </div>
            <p className="text-white/50 text-sm mt-6">Point camera at QR code</p>
          </div>
        )}

        {/* Loading overlay */}
        {scanState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
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
                <p className="text-white/80 text-lg">Gift collected</p>
              </>
            ) : result.reason === 'campaign_closed' ? (
              <>
                <p className="text-white text-3xl font-bold">Campaign closed</p>
                <p className="text-white/80 text-lg">No further gifts can be claimed</p>
              </>
            ) : result.reason === 'not_authorized' ? (
              <>
                <p className="text-white text-3xl font-bold">Not authorised</p>
                <p className="text-white/80 text-lg">You are not assigned to this campaign</p>
              </>
            ) : result.reason === 'already_used' ? (
              <>
                <p className="text-white text-3xl font-bold">Already claimed</p>
                {result.employeeName && (
                  <p className="text-white/80 text-lg">{result.employeeName}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-white text-3xl font-bold">Could not verify</p>
                <p className="text-white/80 text-lg">Try again</p>
              </>
            )}

            <p className="text-white/40 text-sm absolute bottom-10">Tap anywhere to scan next</p>
          </div>
        )}

        {/* History button — shown when not in result state */}
        {scanState !== 'result' && (
          <button
            onClick={() => setShowHistory(true)}
            className="absolute bottom-8 right-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
          >
            History {scanHistory.length > 0 && `(${scanHistory.length})`}
          </button>
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
                <h2 className="text-white font-semibold">Recent scans</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {scanHistory.length === 0 ? (
                <p className="text-zinc-400 text-sm text-center py-6">No scans yet this session</p>
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
                            (entry.outcome === 'invalid' ? 'Invalid QR code' :
                             entry.outcome === 'not_authorized' ? 'Not authorised' :
                             entry.outcome === 'closed' ? 'Campaign closed' : 'Unknown')}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${
                        entry.outcome === 'success' ? 'text-green-400' :
                        entry.outcome === 'already_claimed' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {entry.outcome === 'success' ? 'Claimed' :
                         entry.outcome === 'already_claimed' ? 'Already claimed' :
                         entry.outcome === 'closed' ? 'Closed' :
                         entry.outcome === 'not_authorized' ? 'Not auth.' : 'Invalid'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
