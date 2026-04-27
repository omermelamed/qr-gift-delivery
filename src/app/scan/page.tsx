'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { QrScanner } from '@/components/QrScanner'
import type { TokenVerifyResult } from '@/types'

type ScanState = 'scanning' | 'loading' | 'result'

const RESULT_DISPLAY_MS = 3000
const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleScan = useCallback(
    async (text: string) => {
      if (scanState !== 'scanning') return
      setScanState('loading')

      const match = text.match(TOKEN_PATTERN)
      if (!match) {
        setResult({ valid: false, reason: 'invalid' })
        setScanState('result')
        timeoutRef.current = setTimeout(() => { setResult(null); setScanState('scanning') }, RESULT_DISPLAY_MS)
        return
      }

      const token = match[1]
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: null }),
        })
        const data: TokenVerifyResult = await res.json()
        setResult(data)
      } catch {
        setResult({ valid: false, reason: 'invalid' })
      }

      setScanState('result')
      timeoutRef.current = setTimeout(() => { setResult(null); setScanState('scanning') }, RESULT_DISPLAY_MS)
    },
    [scanState]
  )

  return (
    <main className="flex flex-col min-h-screen bg-black overflow-hidden">
      <div className="relative flex-1">
        <QrScanner onResult={handleScan} active={scanState === 'scanning'} />

        {scanState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-white text-xl font-medium">Checking…</p>
          </div>
        )}

        {scanState === 'result' && result && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-4 ${
              result.valid ? 'bg-green-600/95' : 'bg-red-600/95'
            }`}
          >
            <span className="text-7xl">{result.valid ? '✓' : '✗'}</span>

            {result.valid ? (
              <>
                <p className="text-white text-3xl font-bold">{result.employeeName}</p>
                <p className="text-white/80 text-lg">Gift collected</p>
              </>
            ) : result.reason === 'already_used' ? (
              <>
                <p className="text-white text-2xl font-bold">Already claimed</p>
                <p className="text-white/80 text-lg">{result.employeeName}</p>
              </>
            ) : (
              <p className="text-white text-2xl font-bold">Could not verify — try again</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
