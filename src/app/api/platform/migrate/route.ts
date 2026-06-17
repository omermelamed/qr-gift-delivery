import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'platform_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  // Test if active column exists
  const { error: testError } = await service.from('companies').select('active').limit(1)
  if (!testError) return NextResponse.json({ message: 'Column already exists — nothing to do.' })

  // Column missing — apply via Supabase SQL API
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
  })
  void res

  return NextResponse.json({
    message: 'Please run this SQL in the Supabase dashboard SQL editor:\n\nALTER TABLE companies ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;'
  })
}
