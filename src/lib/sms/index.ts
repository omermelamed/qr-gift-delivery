import type { SmsProvider } from './provider'
import { TwilioProvider } from './twilio-provider'

export type { SmsProvider, SendSmsRequest, SendSmsResult } from './provider'

let provider: SmsProvider | null = null

export function getSmsProvider(): SmsProvider {
  if (!provider) {
    provider = new TwilioProvider()
  }
  return provider
}
