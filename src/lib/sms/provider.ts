export interface SendSmsRequest {
  to: string
  body: string
  messageId?: string
  statusCallbackUrl?: string
}

export interface SendSmsResult {
  providerId: string
  status: 'queued' | 'sent' | 'failed'
  error?: string
}

export interface SmsProvider {
  send(request: SendSmsRequest): Promise<SendSmsResult>
  isConfigured(): boolean
}
