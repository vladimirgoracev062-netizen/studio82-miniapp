import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'STUDIO 82',
  description: 'Telegram Mini App магазин кроссовок STUDIO 82',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
