import { NextRequest, NextResponse } from 'next/server'
import { generateQrBuffer } from '@/lib/qr'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, campaignId } = body

  if (!token || !campaignId) {
    return NextResponse.json(
      { error: 'token and campaignId are required' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const filePath = `${campaignId}/${token}.png`
  const buffer = await generateQrBuffer(token)

  const { error: uploadError } = await supabase.storage
    .from('qr-codes')
    .upload(filePath, buffer, { contentType: 'image/png', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('qr-codes')
    .getPublicUrl(filePath)

  const { error: updateError } = await supabase
    .from('gift_tokens')
    .update({ qr_image_url: publicUrl })
    .eq('token', token)

  if (updateError) {
    console.error('[generate-qr] failed to persist qr_image_url', {
      token,
      error: updateError.message,
    })
  }

  return NextResponse.json({ qrImageUrl: publicUrl })
}
