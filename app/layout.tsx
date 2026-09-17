import { Analytics } from '@vercel/analytics/next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pagewise — Ask your manual out loud',
  description: 'Pagewise answers questions about your equipment manuals by voice or text, grounded only in the documents, with verbatim quotes and page references.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: 'white',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
