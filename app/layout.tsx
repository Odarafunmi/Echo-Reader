import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Echo Shelf',
  description: 'Your books. Your way. Read in your own voice.',
};

export const viewport: Viewport = {
  themeColor: '#0A0A0F',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,600;1,700&family=Inter:wght@400;500;600&family=Literata:ital,wght@0,400;0,500;1,400&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <span className="ambient-blob animate-drift-a -left-40 -top-40 h-[480px] w-[480px] opacity-60" />
          <span className="ambient-blob animate-drift-b -right-40 top-1/3 h-[420px] w-[420px] opacity-50" />
        </div>
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
