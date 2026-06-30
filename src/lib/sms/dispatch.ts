import { buildGiftSmsBody } from './message'
import { renderSmsTemplate } from '@/lib/sms-template'
import { encodeToken } from '@/lib/short-token'
import { countSmsMessages } from './segments'

/** The public gift link embedded in the SMS (short, base64url-encoded token). */
export function buildGiftLink(token: string, appUrl: string): string {
  return `${appUrl}/gift/${encodeToken(token)}`
}

/**
 * Renders the final SMS body for one recipient: the effective template if set,
 * otherwise the built-in default. Single source of truth shared by send/resend
 * so the credit estimate and the actual sent text can never diverge.
 */
export function buildSmsBodyForToken(opts: {
  token: string
  employeeName: string
  campaignName: string
  effectiveTemplate: string | null
  appUrl: string
}): string {
  const giftLink = buildGiftLink(opts.token, opts.appUrl)
  return opts.effectiveTemplate
    ? renderSmsTemplate(opts.effectiveTemplate, { name: opts.employeeName, link: giftLink })
    : buildGiftSmsBody({ employeeName: opts.employeeName, holidayName: opts.campaignName, giftLink })
}

type BillableToken = { id: string; token: string; employee_name: string; phone_number: string | null }

export type TokenMessagePlan = Map<string, { body: string; segments: number }>

/**
 * Pre-computes the SMS body + billed segment count for every recipient that has
 * a phone number, keyed by token id. Returns the plan and the total credits the
 * send will cost (Σ segments), so the credit reservation reflects real InforU
 * billing instead of one-credit-per-recipient.
 */
export function planTokenMessages(
  tokens: BillableToken[],
  ctx: { campaignName: string; effectiveTemplate: string | null; appUrl: string },
): { plan: TokenMessagePlan; totalCredits: number; recipientCount: number } {
  const plan: TokenMessagePlan = new Map()
  let totalCredits = 0
  let recipientCount = 0
  for (const t of tokens) {
    if (!t.phone_number) continue
    recipientCount++
    const body = buildSmsBodyForToken({
      token: t.token,
      employeeName: t.employee_name,
      campaignName: ctx.campaignName,
      effectiveTemplate: ctx.effectiveTemplate,
      appUrl: ctx.appUrl,
    })
    const segments = countSmsMessages(body)
    totalCredits += segments
    plan.set(t.id, { body, segments })
  }
  return { plan, totalCredits, recipientCount }
}
