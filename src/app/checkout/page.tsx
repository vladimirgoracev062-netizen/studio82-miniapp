'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createOrderInDb, fetchProducts, formatPrice, getCart, getTelegramUser, saveCart } from '@/lib/store';
import type { Product } from '@/types';

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState(getCart());

  useEffect(() => {
    setCart(getCart());
    fetchProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const items = useMemo(() => cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { title: product?.title || 'Товар', size: item.size, price: product?.price || 0, quantity: item.quantity };
  }), [cart, products]);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  async function submit() {
    try {
      setError('');
      setLoading(true);
      if (!cart.length) throw new Error('Корзина пустая');
      if (!form.customerName.trim() || !form.phone.trim() || !form.city.trim()) throw new Error('Заполните ФИО, телефон и город');
      const user = getTelegramUser();
      await createOrderInDb({
        cart,
        customerName: form.customerName,
        phone: form.phone,
        city: form.city,
        cdekPoint: form.cdekPoint,
        telegramId: user?.id ? String(user.id) : '',
        telegramUsername: user?.username || '',
      });
      saveCart([]);
      window.location.href = '/profile';
    } catch (err: any) {
      setError(err.message || 'Не удалось создать заказ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <div className="page">
        <Link className="pill" href="/cart">← Корзина</Link>
        <h1 className="title">Оформление</h1>
        <p className="muted">Заказ сохраняется в базе. ЮKassa и автоматический СДЭК подключим следующим этапом.</p>
        <div className="checkout-summary">
          {items.map((item) => <p key={`${item.title}-${item.size}`}>{item.title}, размер {item.size} × {item.quantity}</p>)}
          <b>{formatPrice(total)}</b>
        </div>
        <div className="form">
          <input className="input" placeholder="ФИО" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          <input className="input" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="ПВЗ СДЭК или адрес" value={form.cdekPoint} onChange={(e) => setForm({ ...form, cdekPoint: e.target.value })} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn" disabled={loading} onClick={submit}>{loading ? 'Создаём заказ...' : 'Создать заказ'}</button>
        </div>
      </div>
    </main>
  );
}
