import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'platform_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name: string = String(body.name ?? '').trim()
  const slug: string = String(body.slug ?? toSlug(name)).trim() || toSlug(name)
  const adminEmail: string = String(body.adminEmail ?? '').trim()

  if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  if (!adminEmail) return NextResponse.json({ error: 'Admin email is required' }, { status: 400 })

  const service = createServiceClient()

  const { data: company, error: coError } = await service
    .from('companies')
    .insert({ name, slug })
    .select('id')
    .single()

  if (coError || !company) {
    return NextResponse.json({ error: coError?.message ?? 'Failed to create company' }, { status: 500 })
  }

  const { data: role } = await service
    .from('roles')
    .select('id')
    .eq('name', 'company_admin')
    .eq('is_system', true)
    .single()

  if (!role) return NextResponse.json({ error: 'company_admin role not found' }, { status: 500 })

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(adminEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })

  if (inviteError || !invited?.user) {
    return NextResponse.json({ error: inviteError?.message ?? 'Invite failed' }, { status: 500 })
  }

  const newUserId = invited.user.id

  const { error: metaError } = await service.auth.admin.updateUserById(newUserId, {
    app_metadata: { company_id: company.id, role_id: role.id, role_name: 'company_admin' },
  })
  if (metaError) return NextResponse.json({ error: 'Failed to set user metadata' }, { status: 500 })

  const { error: ucrError } = await service.from('user_company_roles').insert({
    user_id: newUserId,
    company_id: company.id,
    role_id: role.id,
  })
  if (ucrError) return NextResponse.json({ error: 'Failed to assign company role' }, { status: 500 })

  return NextResponse.json({ companyId: company.id }, { status: 201 })
}
