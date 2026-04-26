import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
    from: () => ({
      update: () => ({ eq: mockEq }),
    }),
  }),
}))

vi.mock('@/lib/qr', () => ({
  generateQrBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png-bytes')),
}))

describe('POST /api/generate-qr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/qr-codes/campaign-1/token-1.png' },
    })
    mockEq.mockResolvedValue({ error: null })
  })

  it('returns qrImageUrl on success', async () => {
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.qrImageUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/qr-codes/campaign-1/token-1.png'
    )
  })

  it('returns 400 when token is missing', async () => {
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when campaignId is missing', async () => {
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when storage upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'Storage quota exceeded' } })
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 200 even when gift_tokens update fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'DB write failed' } })
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.qrImageUrl).toBeDefined()
  })
})
