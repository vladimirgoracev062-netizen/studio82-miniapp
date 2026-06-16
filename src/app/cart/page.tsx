'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, formatPrice, getCart, safeImage, saveCart } from '@/lib/store';
import type { CartItem, Product } from '@/types';

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    setCart(getCart());
    fetchProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const lines = useMemo(() => cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { item, product };
  }).filter((line) => line.product), [cart, products]);

  const total = lines.reduce((sum, line) => sum + (line.product?.price || 0) * line.item.quantity, 0);

  function updateQuantity(index: number, quantity: number) {
    const next = cart.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(1, quantity) } : item);
    setCart(next);
    saveCart(next);
  }

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
        <div className="cart-list">
          {lines.map((line, index) => (
            <div className="cart-item" key={`${line.item.productId}-${line.item.size}`}>
              <div className="cart-img square-media"><img src={safeImage(line.product)} alt={line.product?.title || ''} /></div>
              <div className="cart-info">
                <b>{line.product?.title}</b>
                <p className="muted">Размер: {line.item.size}</p>
                <p>{formatPrice(line.product?.price || 0)}</p>
                <div className="qty-row">
                  <button onClick={() => updateQuantity(index, line.item.quantity - 1)}>-</button>
                  <span>{line.item.quantity}</span>
                  <button onClick={() => updateQuantity(index, line.item.quantity + 1)}>+</button>
                  <button className="link-danger" onClick={() => remove(index)}>Удалить</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="total-box">
            <span>Итого</span>
            <b>{formatPrice(total)}</b>
          </div>
        )}
      </div>
      {lines.length > 0 && <Link className="cta" href="/checkout">Оформить заказ</Link>}
    </main>
  );
}
