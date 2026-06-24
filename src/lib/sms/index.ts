import type { SmsProvider } from './provider'
import { InforuProvider } from './inforu-provider'

export type { SmsProvider, SendSmsRequest, SendSmsResult } from './provider'
export { buildGiftSmsBody } from './message'

let provider: SmsProvider | null = null

export function getSmsProvider(): SmsProvider {
  if (!provider) {
    provider = new InforuProvider()
  }
  return provider
}
