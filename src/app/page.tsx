'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatPrice, getCart, getProducts, productAvailable, safeImage } from '@/lib/store';
import type { Product } from '@/types';

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('Все');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  useEffect(() => {
    setProducts(getProducts().filter((p) => p.isPublished));
    setCartCount(getCart().reduce((sum, item) => sum + item.quantity, 0));
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
  }, []);

  const brands = useMemo(() => ['Все', ...Array.from(new Set(products.map((p) => p.brand).filter(Boolean)))], [products]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const text = `${product.brand} ${product.title} ${product.color}`.toLowerCase();
      const matchQuery = !normalized || text.includes(normalized);
      const matchBrand = brand === 'Все' || product.brand === brand;
      const matchAvailable = !onlyAvailable || productAvailable(product);
      return matchQuery && matchBrand && matchAvailable;
    });
  }, [products, query, brand, onlyAvailable]);

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

      <section className="filters">
        <input className="input search" placeholder="Поиск по модели или бренду" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {brands.map((item) => (
            <button key={item} className={`chip ${brand === item ? 'active' : ''}`} onClick={() => setBrand(item)}>{item}</button>
          ))}
        </div>
        <label className="toggle-line">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          <span>Только доступные размеры</span>
        </label>
      </section>

      <section className="grid">
        {filtered.length === 0 && <div className="empty wide">Ничего не найдено</div>}
        {filtered.map((product) => (
          <Link href={`/product/${product.id}`} className="card" key={product.id}>
            <div className="square-media shoe"><img src={safeImage(product)} alt={product.title} /></div>
            <div className="brand">{product.brand}</div>
            <div className="name">{product.title}</div>
            <div className="card-meta">
              <div className="price">{formatPrice(product.price)}</div>
              {!productAvailable(product) && <span className="soldout">Нет размеров</span>}
            </div>
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
