import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const inputRows: Array<{ employee_name: string; phone: string; department?: string }> = Array.isArray(body.rows) ? body.rows : []

  if (inputRows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })

  const rows = inputRows
    .filter((r) => r.employee_name?.trim() && normalizePhone(r.phone ?? ''))
    .map((r) => ({
      company_id: appMeta.company_id,
      employee_name: r.employee_name.trim(),
      phone: normalizePhone(r.phone)!,
      department: r.department?.trim() || null,
    }))

  if (rows.length === 0) return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('employees')
    .upsert(rows, { onConflict: 'company_id,phone', ignoreDuplicates: false })
    .select('id')

  if (error) return NextResponse.json({ error: 'Import failed' }, { status: 500 })

  return NextResponse.json({ upserted: data?.length ?? 0 })
}
