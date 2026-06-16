'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createOrderInDb, fetchProducts, formatPrice, getCart, getTelegramUser, saveCart } from '@/lib/store';
import type { Product } from '@/types';

type DeliveryType = 'cdek_pickup' | 'moscow';
const DIRECT_URL = 'https://t.me/studio82direct';

function openDirect() {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(DIRECT_URL);
  else window.open(DIRECT_URL, '_blank');
}

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '' });
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('cdek_pickup');
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

  function selectDelivery(type: DeliveryType) {
    setDeliveryType(type);
    if (type === 'moscow') {
      setForm((current) => ({ ...current, city: 'Москва', cdekPoint: 'Доставка по Москве — согласовать в Telegram' }));
      openDirect();
    }
  }

  async function submit() {
    try {
      setError('');
      setLoading(true);
      if (!cart.length) throw new Error('Корзина пустая');
      if (!form.customerName.trim() || !form.phone.trim()) throw new Error('Заполните ФИО и телефон');
      if (deliveryType === 'cdek_pickup' && !form.city.trim()) throw new Error('Укажите город доставки');
      const user = getTelegramUser();
      await createOrderInDb({
        cart,
        customerName: form.customerName,
        phone: form.phone,
        city: deliveryType === 'moscow' ? 'Москва' : form.city,
        cdekPoint: deliveryType === 'moscow' ? 'Доставка по Москве — согласовать в Telegram' : form.cdekPoint,
        deliveryType,
        telegramId: user?.id ? String(user.id) : '',
        telegramUsername: user?.username || '',
      });
      saveCart([]);
      if (deliveryType === 'moscow') {
        openDirect();
        window.setTimeout(() => { window.location.href = '/profile'; }, 700);
      } else {
        window.location.href = '/profile';
      }
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
        <p className="muted">Выберите способ доставки. Для Москвы можно сразу перейти в чат STUDIO 82 Direct.</p>
        <div className="checkout-summary">
          {items.map((item) => <p key={`${item.title}-${item.size}`}>{item.title}, размер {item.size} × {item.quantity}</p>)}
          <b>{formatPrice(total)}</b>
        </div>

        <div className="delivery-options">
          <button className={`delivery-option ${deliveryType === 'cdek_pickup' ? 'active' : ''}`} onClick={() => selectDelivery('cdek_pickup')}>
            <b>СДЭК до ПВЗ</b>
            <span className="muted">Выбор города и пункта выдачи. Автоматический расчёт подключим следующим этапом.</span>
          </button>
          <button className={`delivery-option ${deliveryType === 'moscow' ? 'active' : ''}`} onClick={() => selectDelivery('moscow')}>
            <b>Доставка по Москве</b>
            <span className="muted">После выбора откроется чат @studio82direct для согласования доставки.</span>
          </button>
        </div>

        {deliveryType === 'moscow' && (
          <div className="direct-box">
            <b>Доставка по Москве</b>
            <p className="muted">Напишите в STUDIO 82 Direct, чтобы согласовать время и адрес доставки.</p>
            <button className="btn light" onClick={openDirect}>Открыть @studio82direct</button>
          </div>
        )}

        <div className="form">
          <input className="input" placeholder="ФИО" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          <input className="input" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {deliveryType === 'cdek_pickup' && (
            <>
              <input className="input" placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <input className="input" placeholder="ПВЗ СДЭК или адрес" value={form.cdekPoint} onChange={(e) => setForm({ ...form, cdekPoint: e.target.value })} />
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="btn" disabled={loading} onClick={submit}>{loading ? 'Создаём заказ...' : 'Создать заказ'}</button>
        </div>
      </div>
    </main>
  );
}
