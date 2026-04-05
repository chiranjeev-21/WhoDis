import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WhoDis - Find Your Photos Instantly',
  description: 'Upload a selfie and find all photos with you in seconds using AI-powered face recognition',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
