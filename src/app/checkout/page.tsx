'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createOrderInDb, fetchProducts, formatPrice, getCart, getTelegramUser, saveCart } from '@/lib/store';
import type { Order, Product } from '@/types';

type DeliveryType = 'cdek_pickup' | 'moscow';
const DIRECT_URL = 'https://t.me/studio82direct';

function openDirect() {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(DIRECT_URL);
  else window.open(DIRECT_URL, '_blank');
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
}

function buildOrderMessage(order: Order) {
  const lines = order.items
    .map((item) => `• ${item.title}\n  Размер: ${item.size}\n  Количество: ${item.quantity}\n  Цена: ${formatPrice(item.price)}`)
    .join('\n\n');

  return [
    'Здравствуйте! Хочу оформить доставку по Москве.',
    '',
    `Заказ №${order.id}`,
    lines,
    '',
    `Итого: ${formatPrice(order.total)}`,
    '',
    `Имя: ${order.customerName}`,
    `Телефон: ${order.phone}`,
    order.telegramUsername ? `Telegram: @${order.telegramUsername}` : '',
    '',
    'Подскажите, пожалуйста, как согласовать доставку по Москве?',
  ].filter(Boolean).join('\n');
}

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '' });
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('cdek_pickup');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState(getCart());
  const [success, setSuccess] = useState<{ order: Order; directMessage: string; copied: boolean } | null>(null);

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
    setError('');
    if (type === 'moscow') {
      setForm((current) => ({ ...current, city: 'Москва', cdekPoint: 'Доставка по Москве — согласовать в Telegram' }));
    }
  }

  async function copyPreparedMessage() {
    if (!success?.directMessage) return;
    const copied = await copyText(success.directMessage);
    setSuccess((current) => current ? { ...current, copied } : current);
  }

  async function submit() {
    try {
      setError('');
      setLoading(true);
      if (!cart.length) throw new Error('Корзина пустая');
      if (!form.customerName.trim() || !form.phone.trim()) throw new Error('Заполните ФИО и телефон');
      if (deliveryType === 'cdek_pickup' && !form.city.trim()) throw new Error('Укажите город доставки');
      const user = getTelegramUser();
      const order = await createOrderInDb({
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
      setCart([]);

      const directMessage = deliveryType === 'moscow' ? buildOrderMessage(order) : '';
      setSuccess({ order, directMessage, copied: false });

      if (directMessage) {
        const copied = await copyText(directMessage);
        setSuccess((current) => current ? { ...current, copied } : current);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось создать заказ');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="app">
        <div className="page">
          <Link className="pill" href="/">← Каталог</Link>
          <h1 className="title">Заказ создан</h1>
          <div className="checkout-summary">
            <div className="row-between"><b>Заказ №{success.order.id}</b><b>{formatPrice(success.order.total)}</b></div>
            {success.order.items.map((item) => (
              <p key={`${item.title}-${item.size}`}>{item.title}, размер {item.size} × {item.quantity}</p>
            ))}
          </div>

          {success.order.deliveryType === 'moscow' ? (
            <div className="direct-box">
              <b>Доставка по Москве</b>
              <p className="muted">
                Мы подготовили текст заказа для менеджера. {success.copied ? 'Сообщение уже скопировано — откройте чат и вставьте его.' : 'Скопируйте сообщение и отправьте его менеджеру.'}
              </p>
              <textarea className="input prepared-message" readOnly value={success.directMessage} rows={10} />
              <div className="row direct-actions">
                <button className="btn light" onClick={copyPreparedMessage}>{success.copied ? 'Скопировано' : 'Скопировать текст'}</button>
                <button className="btn" onClick={openDirect}>Открыть @studio82direct</button>
              </div>
            </div>
          ) : (
            <div className="direct-box">
              <b>Заказ принят</b>
              <p className="muted">Статус заказа можно посмотреть в разделе «Заказы».</p>
              <Link className="btn" href="/profile">Перейти к заказам</Link>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="page">
        <Link className="pill" href="/cart">← Корзина</Link>
        <h1 className="title">Оформление</h1>
        <p className="muted">Выберите способ доставки и оставьте контактные данные.</p>
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
            <span className="muted">После создания заказа приложение подготовит сообщение для @studio82direct.</span>
          </button>
        </div>

        {deliveryType === 'moscow' && (
          <div className="direct-box">
            <b>Как будет работать</b>
            <p className="muted">После создания заказа мы сформируем текст с моделью, размером, количеством и контактами. Его нужно будет отправить менеджеру в Telegram.</p>
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
