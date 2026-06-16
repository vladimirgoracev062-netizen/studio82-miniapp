'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatPrice, getCart, getProducts, saveCart } from '@/lib/store';
import type { CartItem, Product } from '@/types';

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    setCart(getCart());
    setProducts(getProducts());
  }, []);

  const lines = cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { item, product };
  }).filter((line) => line.product);

  const total = lines.reduce((sum, line) => sum + (line.product?.price || 0) * line.item.quantity, 0);

  function remove(index: number) {
    const next = cart.filter((_, i) => i !== index);
    setCart(next);
    saveCart(next);
  }

  return (
    <main className="app">
      <div className="page">
        <Link className="pill" href="/">← Каталог</Link>
        <h1 className="title">Корзина</h1>
        {lines.length === 0 && <div className="empty">Корзина пустая</div>}
        <div className="admin-table">
          {lines.map((line, index) => (
            <div className="admin-row" key={`${line.item.productId}-${line.item.size}`}>
              <b>{line.product?.title}</b>
              <p className="muted">Размер: {line.item.size}</p>
              <div className="row">
                <span>{formatPrice(line.product?.price || 0)}</span>
                <button className="btn light" onClick={() => remove(index)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <>
            <h2>Итого: {formatPrice(total)}</h2>
            <Link className="cta" href="/checkout">Оформить заказ</Link>
          </>
        )}
      </div>
    </main>
  );
}
