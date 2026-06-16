'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname() || '/';

  if (pathname.startsWith('/checkout') || pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <nav className="nav nav-three client-nav global-bottom-nav" aria-label="Основное меню">
      <Link href="/">Каталог</Link>
      <Link href="/cart">Корзина</Link>
      <Link href="/profile">Заказы</Link>
    </nav>
  );
}
