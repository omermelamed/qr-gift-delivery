import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { LandingPage } from '@/components/landing/LandingPage'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GiftFlow — employee gift distribution, scanned',
  description:
    'Send every employee a personal QR code by SMS, scan at the event, and track redemptions live.',
}

export default function Home() {
  return (
    <div className={spaceGrotesk.variable}>
      <LandingPage />
    </div>
  )
}
