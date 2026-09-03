import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { ReactNode } from 'react';
import { Providers } from '@/lib/providers';
import '@/styles/globals.css';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mini Kanban',
  description: 'A drafting table for your work — token auth, sharing, fractional ordering.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={instrument.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
