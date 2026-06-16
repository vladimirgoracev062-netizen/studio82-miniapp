'use client';

import { useEffect, useState } from 'react';
import { getCart, getOrders, getProducts, saveCart, saveOrders } from '@/lib/store';

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '' });

  function submit() {
    const cart = getCart();
    const products = getProducts();
    const items = cart.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      return { title: product.title, size: item.size, price: product.price, quantity: item.quantity };
    });
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
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
        <h1 className="title">Оформление</h1>
        <p className="muted">СДЭК и ЮKassa будут подключены через API на следующем этапе. Сейчас заказ сохраняется в админке.</p>
        <div className="form">
          <input className="input" placeholder="ФИО" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          <input className="input" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="ПВЗ СДЭК" value={form.cdekPoint} onChange={(e) => setForm({ ...form, cdekPoint: e.target.value })} />
          <button className="btn" onClick={submit}>Создать заказ</button>
        </div>
      </div>
    </main>
  );
}
