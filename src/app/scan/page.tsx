'use client'

import { useState, useCallback, useEffect } from 'react'
import { QrScanner } from '@/components/QrScanner'
import { createClient } from '@/lib/supabase/browser'
import type { TokenVerifyResult } from '@/types'

type ScanState = 'scanning' | 'loading' | 'result'

const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

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
        setResult({ valid: false, reason: 'invalid' })
        setScanState('result')
        return
      }

      const token = match[1]
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: userId }),
        })
        const data: TokenVerifyResult = await res.json()
        setResult(data)
      } catch {
        setResult({ valid: false, reason: 'invalid' })
      }

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

        {/* Scan frame overlay (visible during scanning) */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-52 h-52">
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
              {/* Animated scan line */}
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
            {/* Icon */}
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
              <span className="text-4xl">{result.valid ? '✓' : '✗'}</span>
            </div>

            {/* Message */}
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
      </div>
    </main>
  )
}
