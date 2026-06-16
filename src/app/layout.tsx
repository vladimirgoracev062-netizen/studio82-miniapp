import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import BottomNav from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'STUDIO 82',
  description: 'Telegram Mini App магазин кроссовок STUDIO 82',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
