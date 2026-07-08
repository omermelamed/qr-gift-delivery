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
  supports_arrival_certificates: boolean
  max_attendee_count: number | null
  sms_template: string | null
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
  attending: boolean | null
  attendee_count: number | null
  arrived_count: number | null
  responded_at: string | null
}

export type GiftOption = {
  id: string
  name: string
  position: number
}

export type TokenVerifyResult =
  | { valid: true; employeeName: string; needsGiftSelection?: false; needsArrivalCount?: false; giftName?: string | null }
  | { valid: true; employeeName: string; needsGiftSelection: true; needsArrivalCount?: false; gifts: GiftOption[]; giftName?: string | null }
  | { valid: true; employeeName: string; needsGiftSelection?: false; needsArrivalCount: true; plannedCount: number; giftName?: string | null }
  | { valid: false; reason: 'already_used'; employeeName: string; giftName?: string | null }
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

export type MessageTemplate = {
  id: string
  company_id: string
  name: string
  body_template: string
  variables: string[]
  created_at: string
  updated_at: string
}
