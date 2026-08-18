import './globals.css';
import './os.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Telescope OS',
  description: 'Weekly operating system and outreach console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
