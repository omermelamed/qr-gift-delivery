import type { Metadata } from 'next'
import { Inter, Heebo } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { LanguageToggle } from '@/components/ui/LanguageToggle'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const heebo = Heebo({ subsets: ['hebrew'], variable: '--font-heebo', display: 'swap' })

export const metadata: Metadata = {
  title: 'GiftFlow',
  description: 'Employee gift distribution platform',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const locale = cookieStore.get('giftflow-locale')?.value === 'he' ? 'he' : 'en'

  return (
    <html
      lang={locale}
      dir={locale === 'he' ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${heebo.variable}`}
    >
      <body>
        <LanguageProvider initialLocale={locale}>
          {children}
          <LanguageToggle />
        </LanguageProvider>
      </body>
    </html>
  )
}
