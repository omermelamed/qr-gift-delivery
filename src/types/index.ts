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
}

export type TokenVerifyResult =
  | { valid: true; employeeName: string }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }
  | { valid: false; reason: 'campaign_closed' }
  | { valid: false; reason: 'not_authorized' }

export type JwtAppMetadata = {
  company_id: string
  role_id: string
  role_name: 'platform_admin' | 'company_admin' | 'campaign_manager' | 'scanner'
}
