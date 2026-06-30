'use client'

import { useState, useRef } from 'react'
import { useT } from '@/lib/i18n/useT'

type Props = {
  companyId?: string
  currentUrl: string | null
  onUploaded: (url: string) => void
}

export function LogoUploader({ currentUrl, onUploaded }: Props) {
  const t = useT()
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) { setError(t('Please upload an image file (PNG, JPG, WebP)')); return }
    if (file.size > 2 * 1024 * 1024) { setError(t('Image must be under 2 MB')); return }
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/settings/logo', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
      setPreview(data.url)
      onUploaded(data.url)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      {/* Preview */}
      <div className="w-16 h-16 rounded-xl border border-zinc-200 flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-50">
        {preview ? (
          <img src={preview} alt="Company logo" className="w-full h-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-brand" />
        )}
      </div>

      {/* Drop zone */}
      <div className="flex-1">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
          role="button"
          tabIndex={0}
          aria-label="Upload company logo"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-brand bg-brand-soft' : 'border-zinc-200 hover:border-brand hover-brand'
          }`}
        >
          {uploading ? (
            <p className="text-sm text-zinc-500">{t('Uploading...')}</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                <span className="font-medium text-brand">{t('Click to upload')}</span> {t('or drag and drop')}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">{t('PNG, JPG, WebP · Max 2 MB')}</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }}
            className="hidden"
          />
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  )
}
