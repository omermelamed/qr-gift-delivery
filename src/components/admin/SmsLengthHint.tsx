'use client'

import { useT } from '@/lib/i18n/useT'
import { messagesForLength, projectTemplateLength } from '@/lib/sms/segments'

// Live estimate of how many SMS messages a template will bill. The author types
// {name}/{link}, but those expand at send time — {link} into a ~60-char gift URL
// and {name} into a real name — so we project a realistic length with buffers.
// Hebrew is Unicode, so InforU bills per 201 chars (see lib/sms/segments.ts).
export function SmsLengthHint({ template }: { template: string }) {
  const t = useT()
  if (!template.trim()) return null

  // Tighten the link buffer using the actual configured gift-link host when known.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const linkLen = appUrl ? `${appUrl}/gift/`.length + 24 : undefined

  const projected = projectTemplateLength(template, { linkLen })
  const messages = messagesForLength(projected)
  const multi = messages > 1

  return (
    <p className={`text-xs ${multi ? 'text-amber-600' : 'text-zinc-400'}`}>
      {t('Est.')} {projected} {t('chars')} ·{' '}
      {messages === 1 ? t('1 SMS') : `${messages} ${t('SMS messages')}`}
      {multi && ` — ${t('charged as multiple messages')}`}
    </p>
  )
}
