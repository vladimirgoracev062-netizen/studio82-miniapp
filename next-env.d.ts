'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getCart, getProducts, saveCart, formatPrice } from '@/lib/store';
import type { Product } from '@/types';

export default function ProductPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState('');

  useEffect(() => {
    setProduct(getProducts().find((p) => p.id === params.id) || null);
  }, [params.id]);

  const canBuy = useMemo(() => Boolean(selectedSize), [selectedSize]);

  function addToCart() {
    if (!product || !selectedSize) return;
    const cart = getCart();
    const existing = cart.find((item) => item.productId === product.id && item.size === selectedSize);
    if (existing) existing.quantity += 1;
    else cart.push({ productId: product.id, size: selectedSize, quantity: 1 });
    saveCart(cart);
    window.location.href = '/cart';
  }

  if (!product) return <main className="app"><div className="empty">Товар не найден</div></main>;

  return (
    <main className="app">
      <div className="page">
        <Link className="pill" href="/">← Назад</Link>
        <div className="product-img" style={{ marginTop: 18 }}>
          <img src={product.images[0]} alt={product.title} />
        </div>
        <h1 className="title">{product.title}</h1>
        <div className="muted">{product.color}</div>
        <h2>{formatPrice(product.price)}</h2>
        <p className="muted">{product.description}</p>
        <h3>Размер</h3>
        <div className="sizes">
          {product.sizes.map((s) => (
            <button
              key={s.size}
              className={`size ${s.stock <= 0 ? 'off' : ''} ${selectedSize === s.size ? 'active' : ''}`}
              disabled={s.stock <= 0}
              onClick={() => setSelectedSize(s.size)}
            >
              {s.size}
            </button>
          ))}
        </div>
      </div>
      <button className="cta" disabled={!canBuy} onClick={addToCart}>
        {canBuy ? 'Добавить в корзину' : 'Выберите размер'}
      </button>
    </main>
  );
}
