import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'platform_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data: credits } = await service
    .from('credits')
    .select('total_purchased, total_used, balance')
    .eq('company_id', companyId)
    .single()

  return NextResponse.json({
    credits: credits ?? { total_purchased: 0, total_used: 0, balance: 0 },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'platform_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: 'amount must be a positive integer' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: company } = await service
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const { data: existing } = await service
    .from('credits')
    .select('id, total_purchased, balance')
    .eq('company_id', companyId)
    .single()

  if (existing) {
    await service
      .from('credits')
      .update({
        total_purchased: existing.total_purchased + amount,
        balance: existing.balance + amount,
      })
      .eq('company_id', companyId)
  } else {
    await service
      .from('credits')
      .insert({
        company_id: companyId,
        total_purchased: amount,
        total_used: 0,
        balance: amount,
      })
  }

  await service.from('credit_transactions').insert({
    company_id: companyId,
    amount,
    type: 'grant',
    description: `Platform admin grant (${amount} credits)`,
    created_by: user.id,
  })

  const { data: updated } = await service
    .from('credits')
    .select('total_purchased, total_used, balance')
    .eq('company_id', companyId)
    .single()

  return NextResponse.json({ credits: updated })
}
