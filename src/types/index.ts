export type Company = {
  id: string
  name: string
  slug: string
  created_at: string
}

export type Role = {
  id: string
  company_id: string | null
  name: string
  is_system: boolean
}

export type Permission = {
  id: string
  name: string
}

export type UserCompanyRole = {
  user_id: string
  company_id: string
  role_id: string
  created_at: string
}

export type Campaign = {
  id: string
  company_id: string
  name: string
  campaign_date: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
  closed_at: string | null
  scheduled_at: string | null
  scheduled_confirmed_at: string | null
}

export type GiftToken = {
  id: string
  campaign_id: string
  employee_name: string
  phone_number: string
  department: string | null
  token: string
  qr_image_url: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
  gift_id: string | null
  gift_chosen_at: string | null
}

export type GiftOption = {
  id: string
  name: string
  position: number
}

export type TokenVerifyResult =
  | { valid: true; employeeName: string; needsGiftSelection?: false; giftName?: string | null }
  | { valid: true; employeeName: string; needsGiftSelection: true; gifts: GiftOption[]; giftName?: string | null }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }
  | { valid: false; reason: 'campaign_closed' }
  | { valid: false; reason: 'not_authorized' }

export type JwtAppMetadata = {
  company_id: string
  role_id: string
  role_name: 'platform_admin' | 'company_admin' | 'campaign_manager' | 'scanner'
}

export type ScanOutcome = 'success' | 'already_claimed' | 'invalid' | 'closed' | 'not_authorized'

export type ScanHistoryEntry = {
  employeeName: string | null
  outcome: ScanOutcome
  timestamp: Date
}

// ============================================================
// SMS Bulk Messaging SaaS types
// ============================================================

export type Credits = {
  id: string
  company_id: string
  total_purchased: number
  total_used: number
  balance: number
  updated_at: string
}

export type CreditTransactionType = 'purchase' | 'use' | 'refund' | 'grant'

export type CreditTransaction = {
  id: string
  company_id: string
  amount: number
  type: CreditTransactionType
  description: string | null
  created_at: string
  created_by: string | null
}

export type MessageTemplate = {
  id: string
  company_id: string
  name: string
  body_template: string
  variables: string[]
  created_at: string
  updated_at: string
}

export const CREDIT_PACKAGES = [
  { name: 'Starter', messages: 100, price: 100 },
  { name: 'Small', messages: 300, price: 280 },
  { name: 'Medium', messages: 600, price: 540 },
  { name: 'Large', messages: 1000, price: 850 },
] as const

export type CreditPackage = (typeof CREDIT_PACKAGES)[number]
