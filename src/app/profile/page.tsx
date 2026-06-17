'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchOrders, formatPrice, getTelegramInitData, getTelegramUser } from '@/lib/store';
import type { Order } from '@/types';

export default function ProfilePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const telegramUser = getTelegramUser();
    setUser(telegramUser);
    fetchOrders()
      .then(setOrders)
      .catch((err) => setError(err.message || 'Не удалось загрузить заказы'));
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
  }, []);

  return (
    <main className="app client-app">
      <div className="page studio-simple-page">
        <Link className="pill" href="/">← Каталог</Link>
        <h1 className="title">Мои заказы</h1>
        <div className="profile-card">
          <b>{user?.first_name || 'Покупатель STUDIO 82'}</b>
          {user?.username && <p className="muted">@{user.username}</p>}
        </div>
        {!getTelegramInitData() && <p className="error-text">Откройте магазин внутри Telegram, чтобы видеть свои заказы.</p>}
        {error && <p className="error-text">{error}</p>}
        {orders.length === 0 && !error && <div className="empty">Заказов пока нет</div>}
        <div className="order-list">
          {orders.map((order) => (
            <div className="order-card" key={order.dbId || order.id}>
              <div className="row-between"><b>Заказ #{order.id}</b><span className="badge">{order.status}</span></div>
              {order.items.map((item) => (
                <p className="muted" key={item.title + item.size}>{item.title}, размер {item.size} × {item.quantity}</p>
              ))}
              {order.deliveryType !== 'moscow' && (
                <p className="muted">
                  {order.cdekDeliveryMode === 'courier' ? 'СДЭК курьером' : 'СДЭК ПВЗ/постамат'} · {order.city}
                  {order.cdekPoint ? ` · ${order.cdekPoint}` : ''}
                </p>
              )}
              {order.cdekDeliveryPrice ? <p className="muted">Доставка СДЭК: {formatPrice(order.cdekDeliveryPrice)}</p> : null}
              <b>{formatPrice(order.total)}</b>
              {order.trackNumber && <p>Трек СДЭК: <b>{order.trackNumber}</b></p>}
              {order.trackNumber && <a className="btn light" href={`https://www.cdek.ru/ru/tracking?order_id=${order.trackNumber}`} target="_blank">Отследить</a>}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
