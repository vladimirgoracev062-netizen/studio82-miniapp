'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCart, getProducts, formatPrice } from '@/lib/store';
import type { Product } from '@/types';

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setProducts(getProducts().filter((p) => p.isPublished));
    setCartCount(getCart().length);
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
  }, []);

  return (
    <main className="app">
      <header className="top">
        <div className="logo"><span>STUDIO</span><span>82</span></div>
        <Link className="pill" href="/cart">Корзина {cartCount ? `(${cartCount})` : ''}</Link>
      </header>
      <section className="hero">
        <h1>В НАЛИЧИИ</h1>
        <p>Оригинальные кроссовки STUDIO 82. Выберите модель и размер.</p>
      </section>
      <section className="grid">
        {products.map((product) => (
          <Link href={`/product/${product.id}`} className="card" key={product.id}>
            <div className="shoe"><img src={product.images[0]} alt={product.title} /></div>
            <div className="brand">{product.brand}</div>
            <div className="name">{product.title}</div>
            <div className="price">{formatPrice(product.price)}</div>
          </Link>
        ))}
      </section>
      <nav className="nav nav-three">
        <Link href="/">Каталог</Link>
        <Link href="/cart">Корзина</Link>
        <Link href="/profile">Заказы</Link>
      </nav>
    </main>
  );
}
