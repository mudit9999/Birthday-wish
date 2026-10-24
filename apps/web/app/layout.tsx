import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Instrument_Serif } from 'next/font/google'
import './globals.css'

const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'Family Wishes',
  description: 'Birthdays, anniversaries and festivals for the family WhatsApp group.',
  robots: { index: false, follow: false }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff'
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
