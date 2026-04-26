---
name: qr-generation
description: Workflow for generating QR code PNGs from token UUIDs, uploading to Supabase Storage, and returning public URLs for Twilio MMS. Use when implementing the QR generation API route.
---

# QR Generation

## Workflow

1. receive `token` UUID and `campaignId`
2. build the verification URL: `https://{domain}/verify/{token}`
3. generate a PNG buffer using the `qrcode` npm package
4. upload to Supabase Storage at `qr-codes/{campaignId}/{token}.png`
5. get the public URL from Supabase Storage
6. update `gift_tokens.qr_image_url` with the public URL
7. return the public URL for use in Twilio MMS

## Implementation

```ts
import QRCode from 'qrcode'

export async function generateQrImage(token: string, campaignId: string): Promise<string> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${token}`

  const pngBuffer = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M'
  })

  const supabase = createServiceClient()

  await supabase.storage
    .from('qr-codes')
    .upload(`${campaignId}/${token}.png`, pngBuffer, {
      contentType: 'image/png',
      upsert: false
    })

  const { data: { publicUrl } } = supabase.storage
    .from('qr-codes')
    .getPublicUrl(`${campaignId}/${token}.png`)

  await supabase
    .from('gift_tokens')
    .update({ qr_image_url: publicUrl })
    .eq('token', token)

  return publicUrl
}
```

## QR code sizing

- minimum 400px wide for reliable phone camera scanning
- `errorCorrectionLevel: 'M'` — balanced between density and scan reliability
- keep the URL short; avoid query params in the token URL

## Anti-patterns

- do not generate QR in the browser — always server-side
- do not store QR images locally — Supabase Storage is the only location Twilio can fetch from
- do not upsert without checking for accidental overwrites on reruns
