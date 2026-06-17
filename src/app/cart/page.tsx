'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, formatPrice, getCart, safeImage, saveCart } from '@/lib/store';
import type { CartItem, Product } from '@/types';

function getStock(product: Product | undefined, size: string) {
  return Number(product?.sizes.find((item) => item.size === size)?.stock || 0);
}

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    setCart(getCart());
    fetchProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!products.length || !cart.length) return;

    let changed = false;
    const normalized = cart
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const stock = getStock(product, item.size);
        const quantity = Math.min(Math.max(1, Number(item.quantity || 1)), stock);
        if (quantity !== item.quantity) changed = true;
        return { ...item, quantity };
      })
      .filter((item) => {
        const product = products.find((p) => p.id === item.productId);
        const hasStock = getStock(product, item.size) > 0;
        if (!hasStock) changed = true;
        return hasStock;
      });

    if (changed) {
      setCart(normalized);
      saveCart(normalized);
    }
  }, [products, cart]);

  const lines = useMemo(() => cart.map((item, cartIndex) => {
    const product = products.find((p) => p.id === item.productId);
    const stock = getStock(product, item.size);
    return { item, product, stock, cartIndex };
  }).filter((line) => line.product), [cart, products]);

  const total = lines.reduce((sum, line) => sum + (line.product?.price || 0) * line.item.quantity, 0);

  function updateQuantity(cartIndex: number, quantity: number, maxStock: number) {
    if (maxStock <= 0) return remove(cartIndex);
    const nextQuantity = Math.min(Math.max(1, quantity), maxStock);
    const next = cart.map((item, itemIndex) => itemIndex === cartIndex ? { ...item, quantity: nextQuantity } : item);
    setCart(next);
    saveCart(next);
  }

  function remove(cartIndex: number) {
    const next = cart.filter((_, i) => i !== cartIndex);
    setCart(next);
    saveCart(next);
  }

  return (
    <main className="app client-app cart-page">
      <div className="page studio-simple-page">
        <Link className="pill" href="/">← Каталог</Link>
        <h1 className="title">Корзина</h1>
        {lines.length === 0 && <div className="empty">Корзина пустая</div>}
        <div className="cart-list">
          {lines.map((line) => {
            const atMax = line.item.quantity >= line.stock;
            return (
              <div className="cart-item" key={`${line.item.productId}-${line.item.size}`}>
                <div className="cart-img square-media"><img src={safeImage(line.product)} alt={line.product?.title || ''} /></div>
                <div className="cart-info">
                  <b>{line.product?.title}</b>
                  <p className="muted">Размер: {line.item.size}</p>
                  <p>{formatPrice(line.product?.price || 0)}</p>
                  <div className="qty-row">
                    <button onClick={() => updateQuantity(line.cartIndex, line.item.quantity - 1, line.stock)}>-</button>
                    <span>{line.item.quantity}</span>
                    <button disabled={atMax} onClick={() => updateQuantity(line.cartIndex, line.item.quantity + 1, line.stock)}>+</button>
                    <button className="link-danger" onClick={() => remove(line.cartIndex)}>Удалить</button>
                  </div>
                  {atMax && <p className="cart-limit">Больше этого размера сейчас недоступно</p>}
                </div>
              </div>
            );
          })}
        </div>
        {lines.length > 0 && (
          <div className="total-box">
            <span>Итого</span>
            <b>{formatPrice(total)}</b>
          </div>
        )}
      </div>
      {lines.length > 0 && (
        <div className="cart-checkout-bar">
          <Link className="cart-checkout-button" href="/checkout">Оформить заказ</Link>
        </div>
      )}
    </main>
  );
}
