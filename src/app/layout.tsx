import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './appearance.css';

export const metadata: Metadata = {
  title: 'SWRTracker',
  description: 'Field-first survey work request tracking',
  icons: { icon: '/brand/axiom-icon.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
