'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatPrice, getCart, getOrders, getProducts, saveCart, saveOrders } from '@/lib/store';

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '' });
  const [error, setError] = useState('');

  const cart = typeof window !== 'undefined' ? getCart() : [];
  const products = typeof window !== 'undefined' ? getProducts() : [];
  const items = cart.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    return { title: product?.title || 'Товар', size: item.size, price: product?.price || 0, quantity: item.quantity };
  });
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  function submit() {
    if (!cart.length) {
      setError('Корзина пустая');
      return;
    }
    if (!form.customerName.trim() || !form.phone.trim() || !form.city.trim()) {
      setError('Заполните ФИО, телефон и город');
      return;
    }

    const order = {
      id: String(Date.now()).slice(-6),
      createdAt: new Date().toISOString(),
      customerName: form.customerName,
      phone: form.phone,
      city: form.city,
      cdekPoint: form.cdekPoint,
      total,
      status: 'Новый' as const,
      items,
    };
    saveOrders([order, ...getOrders()]);
    saveCart([]);
    window.location.href = '/profile';
  }

  return (
    <main className="app">
      <div className="page">
        <Link className="pill" href="/cart">← Корзина</Link>
        <h1 className="title">Оформление</h1>
        <p className="muted">СДЭК и ЮKassa будут подключены через API на следующем этапе. Сейчас заказ сохраняется в личном кабинете и админке.</p>
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
          <button className="btn" onClick={submit}>Создать заказ</button>
        </div>
      </div>
    </main>
  );
}
