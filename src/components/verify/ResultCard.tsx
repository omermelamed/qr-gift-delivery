'use client'

import { useT } from '@/lib/i18n/useT'

type Props = {
  icon: string
  color: 'green' | 'red'
  title: string
  subtitle: string
  subtitlePrefix?: string
}

export function ResultCard({ icon, color, title, subtitle, subtitlePrefix }: Props) {
  const t = useT()
  const bg = color === 'green' ? 'bg-green-600' : 'bg-red-600'
  return (
    <main className={`flex flex-col items-center justify-center min-h-screen ${bg} gap-5 px-8`}>
      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
        <span className="text-4xl">{icon}</span>
      </div>
      <p className="text-white text-4xl font-bold text-center">{t(title)}</p>
      <p className="text-white/80 text-lg text-center">
        {subtitlePrefix ? `${subtitlePrefix} ${t(subtitle)}` : t(subtitle)}
      </p>
      <a
        href="/scan"
        className="mt-6 bg-white/20 hover:bg-white/30 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {t('Back to scanner')}
      </a>
    </main>
  )
}
