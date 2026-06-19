'use client'

import { useT } from '@/lib/i18n/useT'

type Props = { text: string }

export function PageHeading({ text }: Props) {
  const t = useT()
  return <h1 className="text-2xl font-bold text-zinc-900 mb-6">{t(text)}</h1>
}
