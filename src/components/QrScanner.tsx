'use client'

import { useEffect, useRef } from 'react'

type Props = {
  onResult: (text: string) => void
  active: boolean
}

export function QrScanner({ onResult, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    if (!active || !videoRef.current) return

    let stopped = false
    let stopControls: (() => void) | null = null

    async function startScanner() {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (stopped) return
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result) => {
          if (result) onResultRef.current(result.getText())
        }
      )
      stopControls = () => controls.stop()
    }

    startScanner().catch(console.error)

    return () => {
      stopped = true
      stopControls?.()
    }
  }, [active])

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover"
      playsInline
      muted
    />
  )
}
