'use client';

import { useEffect, useState } from 'react';
import { formatPrice, getOrders, getProducts, saveOrders, saveProducts } from '@/lib/store';
import type { Order, OrderStatus, Product } from '@/types';

const statuses: OrderStatus[] = ['Новый', 'Оплачен', 'Собирается', 'Передан в СДЭК', 'В пути', 'Готов к выдаче', 'Завершён'];

export default function AdminPage() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setProducts(getProducts());
    setOrders(getOrders());
  }, []);

  function persistProducts(next: Product[]) {
    setProducts(next);
    saveProducts(next);
  }

  function persistOrders(next: Order[]) {
    setOrders(next);
    saveOrders(next);
  }

  function updateProduct(id: string, patch: Partial<Product>) {
    persistProducts(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function updateSize(productId: string, size: string, stock: number) {
    persistProducts(products.map((p) => p.id === productId ? { ...p, sizes: p.sizes.map((s) => s.size === size ? { ...s, stock } : s) } : p));
  }

  if (!logged) {
    return (
      <main className="app">
        <div className="page">
          <h1 className="title">Админка</h1>
          <p className="muted">MVP-вход. Пароль для теста: admin82. В продакшене подключим серверную авторизацию.</p>
          <input className="input" type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setLogged(password === 'admin82')}>Войти</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="page">
        <h1 className="title">Админка</h1>
        <h2>Заказы</h2>
        <div className="admin-table">
          {orders.map((order) => (
            <div className="admin-row" key={order.id}>
              <b>#{order.id} — {order.customerName}</b>
              <p className="muted">{order.phone} · {order.city} · {order.cdekPoint}</p>
              <select className="input" value={order.status} onChange={(e) => persistOrders(orders.map((o) => o.id === order.id ? { ...o, status: e.target.value as OrderStatus } : o))}>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input className="input" placeholder="Трек-номер СДЭК" value={order.trackNumber || ''} onChange={(e) => persistOrders(orders.map((o) => o.id === order.id ? { ...o, trackNumber: e.target.value } : o))} />
            </div>
          ))}
        </div>
        <h2>Товары</h2>
        <div className="admin-table">
          {products.map((product) => (
            <div className="admin-row" key={product.id}>
              <input className="input" value={product.title} onChange={(e) => updateProduct(product.id, { title: e.target.value })} />
              <input className="input" type="number" value={product.price} onChange={(e) => updateProduct(product.id, { price: Number(e.target.value) })} />
              <textarea className="input" rows={3} value={product.description} onChange={(e) => updateProduct(product.id, { description: e.target.value })} />
              <div className="sizes">
                {product.sizes.map((s) => (
                  <label className="badge" key={s.size}>
                    {s.size}: <input style={{ width: 42, marginLeft: 6 }} type="number" value={s.stock} onChange={(e) => updateSize(product.id, s.size, Number(e.target.value))} />
                  </label>
                ))}
              </div>
              <p>{formatPrice(product.price)}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
