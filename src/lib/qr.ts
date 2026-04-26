import QRCode from 'qrcode'

export async function generateQrBuffer(token: string): Promise<Buffer> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set')
  }
  const verifyUrl = `${appUrl}/verify/${token}`
  return QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}
