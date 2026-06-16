'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchOrders, formatPrice, getTelegramUser } from '@/lib/store';
import type { Order } from '@/types';

export default function ProfilePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const telegramUser = getTelegramUser();
    setUser(telegramUser);
    fetchOrders(undefined, telegramUser?.id ? String(telegramUser.id) : undefined)
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
        {error && <p className="error-text">{error}</p>}
        {orders.length === 0 && !error && <div className="empty">Заказов пока нет</div>}
        <div className="order-list">
          {orders.map((order) => (
            <div className="order-card" key={order.dbId || order.id}>
              <div className="row-between"><b>Заказ #{order.id}</b><span className="badge">{order.status}</span></div>
              {order.items.map((item) => (
                <p className="muted" key={item.title + item.size}>{item.title}, размер {item.size} × {item.quantity}</p>
              ))}
              <b>{formatPrice(order.total)}</b>
              {order.trackNumber && <p>Трек СДЭК: <b>{order.trackNumber}</b></p>}
              {order.trackNumber && <a className="btn light" href={`https://www.cdek.ru/ru/tracking?order_id=${order.trackNumber}`} target="_blank">Отследить</a>}
            </div>
          ))}
        </div>
      </div>
      <nav className="nav nav-three">
        <Link href="/">Каталог</Link>
        <Link href="/cart">Корзина</Link>
        <Link href="/profile">Заказы</Link>
      </nav>
    </main>
  );
}
