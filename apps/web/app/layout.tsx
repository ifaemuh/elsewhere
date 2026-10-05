import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'Elsewhere — your group trip, watched',
  description:
    'Forward the group’s bookings. Elsewhere checks everyone’s documents, watches every flight, and tells the right people what they’re owed — with the rule cited.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf8f1] text-[#2f3a2c] antialiased">{children}</body>
    </html>
  );
}
