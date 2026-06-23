'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, formatPrice, getCart, productAvailable, safeImage } from '@/lib/store';
import type { Product } from '@/types';

function sizesText(product: Product) {
  const sizes = product.sizes
    .filter((item) => Number(item.stock) > 0)
    .map((item) => item.size)
    .sort((a, b) => Number(a) - Number(b));

  if (!sizes.length) return 'Нет доступных размеров';
  if (sizes.length === 1) return `Размер ${sizes[0]}`;

  const numeric = sizes.map(Number).filter((item) => !Number.isNaN(item));
  if (numeric.length === sizes.length) {
    const min = Math.min(...numeric);
    const max = Math.max(...numeric);
    return `Размеры ${min}–${max}`;
  }

  return `Размеры ${sizes.slice(0, 4).join(', ')}${sizes.length > 4 ? '…' : ''}`;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('Все');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  useEffect(() => {
    setPage(1);
  }, [query, brand, onlyAvailable, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  return (
    <main className="app client-app">
      <header className="client-top">
        <Link className="brand-logo-link" href="/" aria-label="STUDIO 82">
          <img className="brand-logo-img" src="/studio82-logo.png" alt="STUDIO 82" />
        </Link>
        <Link className="cart-chip" href="/cart">Корзина {cartCount ? `(${cartCount})` : ''}</Link>
      </header>

      <section className="catalog-hero">
        <h1>Каталог</h1>
        <p>Оригинальные кроссовки STUDIO 82. Выберите модель, размер и удобный способ получения.</p>
      </section>

      <section className="filters client-filters">
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
        <div className="catalog-page-size">
          <span className="muted">Показывать:</span>
          {[10, 20, 50, 100].map((count) => (
            <button key={count} className={`chip ${pageSize === count ? 'active' : ''}`} type="button" onClick={() => setPageSize(count)}>{count}</button>
          ))}
        </div>
      </section>

      <section className="product-grid">
        {filtered.length === 0 && <div className="empty wide">Ничего не найдено</div>}
        {paginatedProducts.map((product) => (
          <Link href={`/product/${product.id}`} className="product-card" key={product.id}>
            <div className="product-card-photo square-media"><img src={safeImage(product)} alt={product.title} /></div>
            <div className="product-card-body">
              <div className="product-card-brand">{product.brand}</div>
              <div className="product-card-title">{product.title}</div>
              {product.color && <div className="product-card-color">{product.color}</div>}
              <div className="product-card-bottom">
                <div className="product-card-price">{formatPrice(product.price)}</div>
                <div className={`product-card-sizes ${!productAvailable(product) ? 'muted-size' : ''}`}>{sizesText(product)}</div>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {filtered.length > pageSize && (
        <section className="pagination-row">
          <button className="btn light" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Назад</button>
          <span className="muted">Страница {safePage} из {pageCount} · найдено {filtered.length}</span>
          <button className="btn light" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Далее</button>
        </section>
      )}

    </main>
  );
}
