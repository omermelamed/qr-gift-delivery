import { createServiceClient } from '@/lib/supabase/server'

type AuditAction =
  | 'campaign.created'
  | 'campaign.launched'
  | 'campaign.closed'
  | 'campaign.deleted'
  | 'campaign.duplicated'
  | 'campaign.reminder_sent'
  | 'token.redeemed'
  | 'credits.purchased'
  | 'credits.used'
  | 'credits.refunded'
  | 'template.created'
  | 'template.updated'
  | 'template.deleted'
  | 'member.invited'
  | 'member.updated'
  | 'member.role_changed'
  | 'member.removed'
  | 'platform.impersonated'

type AuditEventInput = {
  companyId: string
  actorId: string | null
  action: AuditAction
  resourceType: 'campaign' | 'gift_token' | 'credits' | 'template' | 'user' | 'company'
  resourceId?: string
  metadata?: Record<string, unknown>
}

export function logAuditEvent(input: AuditEventInput): void {
  // Fire-and-forget — never await this, never let it block the primary action
  const service = createServiceClient()
  service
    .from('audit_events')
    .insert({
      company_id: input.companyId,
      actor_id: input.actorId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      metadata: input.metadata ?? {},
    })
    .then(({ error }) => {
      if (error) console.error('[audit] insert failed:', error.message)
    })
}
