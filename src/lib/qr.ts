import QRCode from 'qrcode'

export async function generateQrBuffer(token: string): Promise<Buffer> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${token}`
  return QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}
