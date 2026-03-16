import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Growth Tracker | Wander',
  description: 'Marketing performance dashboard for Wander',
  robots: 'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-bg-primary text-text-primary font-sans antialiased">
        <ThemeProvider defaultTheme="dark">
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
