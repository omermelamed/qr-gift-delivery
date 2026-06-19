import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { CREDIT_PACKAGES } from '@/types'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'credits:purchase')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { packageName } = body

  const pkg = CREDIT_PACKAGES.find((p) => p.name === packageName)
  if (!pkg) {
    return NextResponse.json({ error: 'Invalid package' }, { status: 400 })
  }

  const service = createServiceClient()
  const companyId = appMeta.company_id

  // Upsert credits row — add purchased amount to existing balance
  const { error: upsertError } = await service.rpc('purchase_credits', {
    p_company_id: companyId,
    p_amount: pkg.messages,
  })

  if (upsertError) {
    // Fallback: if RPC doesn't exist yet, do it manually
    const { data: existing } = await service
      .from('credits')
      .select('id, total_purchased, balance')
      .eq('company_id', companyId)
      .single()

    if (existing) {
      const { error } = await service
        .from('credits')
        .update({
          total_purchased: existing.total_purchased + pkg.messages,
          balance: existing.balance + pkg.messages,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
      if (error) return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 })
    } else {
      const { error } = await service
        .from('credits')
        .insert({
          company_id: companyId,
          total_purchased: pkg.messages,
          total_used: 0,
          balance: pkg.messages,
        })
      if (error) return NextResponse.json({ error: 'Failed to create credits' }, { status: 500 })
    }
  }

  // Record the transaction
  await service.from('credit_transactions').insert({
    company_id: companyId,
    amount: pkg.messages,
    type: 'purchase',
    description: `${pkg.name} package — ${pkg.messages} messages for ₪${pkg.price}`,
    created_by: user.id,
  })

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'credits.purchased',
    resourceType: 'credits',
    resourceId: companyId,
    metadata: { package: pkg.name, messages: pkg.messages, price: pkg.price },
  })

  // Return updated balance
  const { data: updated } = await service
    .from('credits')
    .select('total_purchased, total_used, balance')
    .eq('company_id', companyId)
    .single()

  return NextResponse.json({ credits: updated })
}
