'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, formatPrice, getCart, productAvailable, safeImage } from '@/lib/store';
import type { Product } from '@/types';

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('Все');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  useEffect(() => {
    fetchProducts().then((items) => setProducts(items.filter((p) => p.isPublished))).catch(() => setProducts([]));
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
    <main className="app client-app">
      <header className="client-top">
        <Link href="/" className="client-logo" aria-label="STUDIO 82">
          <span>STUDIO</span><b>82</b>
        </Link>
        <Link className="cart-pill" href="/cart">Корзина {cartCount ? <b>{cartCount}</b> : null}</Link>
      </header>

      <section className="client-hero">
        <div>
          <p className="eyebrow">STUDIO 82 / AVAILABLE NOW</p>
          <h1>В НАЛИЧИИ</h1>
          <p>Выберите модель, размер и оформите заказ в Telegram.</p>
        </div>
      </section>

      <section className="client-filters">
        <input className="input search" placeholder="Поиск по модели или бренду" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips brand-scroll">
          {brands.map((item) => (
            <button key={item} className={`chip ${brand === item ? 'active' : ''}`} onClick={() => setBrand(item)}>{item}</button>
          ))}
        </div>
        <button className={`availability-toggle ${onlyAvailable ? 'active' : ''}`} onClick={() => setOnlyAvailable((value) => !value)}>
          Только товары с доступными размерами
        </button>
      </section>

      <section className="catalog-head">
        <h2>Каталог</h2>
        <span>{filtered.length} моделей</span>
      </section>

      <section className="grid product-grid">
        {filtered.length === 0 && <div className="empty wide">Ничего не найдено</div>}
        {filtered.map((product) => {
          const availableSizes = product.sizes.filter((size) => Number(size.stock) > 0).map((size) => size.size).slice(0, 4);
          return (
            <Link href={`/product/${product.id}`} className="card product-card" key={product.id}>
              <div className="square-media shoe product-cover"><img src={safeImage(product)} alt={product.title} /></div>
              <div className="brand">{product.brand}</div>
              <div className="name">{product.title}</div>
              <div className="product-color">{product.color}</div>
              <div className="mini-sizes">
                {availableSizes.length ? availableSizes.map((size) => <span key={size}>{size}</span>) : <span className="muted-chip">нет размеров</span>}
              </div>
              <div className="card-meta">
                <div className="price">{formatPrice(product.price)}</div>
                {!productAvailable(product) ? <span className="soldout">Нет размеров</span> : <span className="select-label">Выбрать</span>}
              </div>
            </Link>
          );
        })}
      </section>

      <nav className="nav nav-three client-nav">
        <Link href="/">Каталог</Link>
        <Link href="/cart">Корзина</Link>
        <Link href="/profile">Заказы</Link>
      </nav>
    </main>
  );
}
