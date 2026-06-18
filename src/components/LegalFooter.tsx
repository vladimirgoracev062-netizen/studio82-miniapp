'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function LegalFooter() {
  const pathname = usePathname() || '/';
  if (pathname.startsWith('/admin') || pathname.startsWith('/checkout')) return null;

  return (
    <footer className="legal-footer">
      <div className="legal-footer-links">
        <Link href="/legal/offer">Оферта</Link>
        <Link href="/legal/privacy">Конфиденциальность</Link>
        <Link href="/legal/returns">Возврат</Link>
        <Link href="/legal/requisites">Реквизиты</Link>
      </div>
      <p>ИП Горячев Владимир Дмитриевич · ИНН 910821091577</p>
    </footer>
  );
}
