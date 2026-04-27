import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Elsewhere — AI travel previews, real bookings',
  description:
    'See yourself in your next vacation before you book it. Personalized AI previews, one-click trips, and live travel assist.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
