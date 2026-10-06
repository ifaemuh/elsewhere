import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'Elsewhere — what you’re owed when travel goes sideways',
  description:
    'Cancelled flights, lost bags, bumped seats, surprise fees, passports and permits. Every travel rule in plain English, with the official source linked.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf8f1] text-[#2f3a2c] antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
