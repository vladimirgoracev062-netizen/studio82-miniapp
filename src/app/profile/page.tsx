'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice, getOrders } from '@/lib/store';
import type { Order } from '@/types';

export default function ProfilePage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setOrders(getOrders());
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready?.();
  }, []);

  return (
    <main className="app">
      <div className="page">
        <Link className="pill" href="/">← Каталог</Link>
        <h1 className="title">Мои заказы</h1>
        {orders.length === 0 && <div className="empty">Заказов пока нет</div>}
        <div className="admin-table">
          {orders.map((order) => (
            <div className="admin-row" key={order.id}>
              <b>Заказ #{order.id}</b>
              <p><span className="badge">{order.status}</span></p>
              {order.items.map((item) => (
                <p className="muted" key={item.title + item.size}>{item.title}, размер {item.size}</p>
              ))}
              <b>{formatPrice(order.total)}</b>
              {order.trackNumber && <p>Трек: {order.trackNumber}</p>}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
