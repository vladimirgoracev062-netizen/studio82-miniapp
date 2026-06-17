'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { checkYookassaPayment, createYookassaPayment, fetchOrders, formatPrice, getTelegramInitData, getTelegramUser, refreshCdekOrderStatus } from '@/lib/store';
import type { Order } from '@/types';

export default function ProfilePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  function buildMoscowMessage(order: Order) {
    const items = order.items.map((item) => `• ${item.title}, размер ${item.size} × ${item.quantity}`).join('\n');
    return [
      `Здравствуйте! Я оплатил заказ №${order.id}.`,
      '',
      items,
      '',
      `ФИО: ${order.customerName}`,
      `Телефон: ${order.phone}`,
      order.telegramUsername ? `Telegram: @${order.telegramUsername}` : '',
      '',
      'Хочу согласовать доставку по Москве.',
    ].filter(Boolean).join('\n');
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  function openDirect() {
    const url = 'https://t.me/studio82direct';
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }

  async function payOrder(order: Order) {
    if (!order.dbId) return;
    try {
      setActionMessage('');
      setSavingId(`pay-${order.dbId}`);
      const result = await createYookassaPayment(order.dbId);
      if (result.order) setOrders((current) => current.map((item) => (item.dbId === result.order?.dbId ? result.order as Order : item)));
      if (result.paid) {
        setActionMessage('Заказ уже оплачен.');
        return;
      }
      if (!result.confirmationUrl) throw new Error('ЮKassa не вернула ссылку на оплату');
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openLink) tg.openLink(result.confirmationUrl);
      else window.location.href = result.confirmationUrl;
    } catch (err: any) {
      setActionMessage(err.message || 'Не удалось открыть оплату');
    } finally {
      setSavingId(null);
    }
  }

  async function refreshPayment(order: Order) {
    if (!order.dbId) return;
    try {
      setActionMessage('');
      setSavingId(`check-${order.dbId}`);
      const updated = await checkYookassaPayment(order.dbId);
      setOrders((current) => current.map((item) => (item.dbId === updated.dbId ? updated : item)));
      setActionMessage(updated.paymentStatus === 'paid' ? 'Оплата подтверждена.' : 'Платёж пока не завершён.');
    } catch (err: any) {
      setActionMessage(err.message || 'Не удалось проверить оплату');
    } finally {
      setSavingId(null);
    }
  }

  async function contactMoscowManager(order: Order) {
    const copied = await copyText(buildMoscowMessage(order));
    setActionMessage(copied ? 'Сообщение скопировано. Откройте чат и вставьте его менеджеру.' : 'Откройте чат и отправьте данные заказа менеджеру.');
    openDirect();
  }

  useEffect(() => {
    const telegramUser = getTelegramUser();
    setUser(telegramUser);
    fetchOrders()
      .then(async (loadedOrders) => {
        setOrders(loadedOrders);
        const ordersWithPayments = loadedOrders.filter((order) => order.dbId && order.yookassaPaymentId && order.paymentStatus !== 'paid');
        const paymentRefreshed = await Promise.all(
          ordersWithPayments.map((order) => checkYookassaPayment(order.dbId as string).catch(() => null)),
        );
        const paymentMap = new Map(paymentRefreshed.filter(Boolean).map((order) => [(order as Order).dbId, order as Order]));
        const afterPayments = loadedOrders.map((order) => paymentMap.get(order.dbId) || order);
        setOrders(afterPayments);

        const ordersWithCdek = afterPayments.filter((order) => order.dbId && order.cdekOrderUuid);
        if (!ordersWithCdek.length) return;

        const refreshed = await Promise.all(
          ordersWithCdek.map((order) => refreshCdekOrderStatus(order.dbId as string).catch(() => null)),
        );
        const refreshedMap = new Map(refreshed.filter(Boolean).map((order) => [(order as Order).dbId, order as Order]));
        setOrders((current) => current.map((order) => refreshedMap.get(order.dbId) || order));
      })
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
        {actionMessage && <p className={actionMessage.includes('Не') || actionMessage.toLowerCase().includes('ош') ? 'error-text' : 'success-text'}>{actionMessage}</p>}
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
              <p className={order.paymentStatus === 'paid' ? 'success-text' : 'muted'}>Оплата: {order.paymentStatus === 'paid' ? 'оплачено' : order.paymentStatus === 'canceled' ? 'отменена' : 'ожидает оплаты'}</p>
              {order.cdekStatus ? <p className="muted">Статус СДЭК: {order.cdekStatusDescription || order.cdekStatus}</p> : null}
              <b>{formatPrice(order.total)}</b>
              {order.paymentStatus !== 'paid' && order.dbId && (
                <div className="row">
                  <button className="btn" disabled={savingId === `pay-${order.dbId}`} onClick={() => payOrder(order)}>{savingId === `pay-${order.dbId}` ? 'Открываем...' : 'Оплатить'}</button>
                  {order.yookassaPaymentId && <button className="btn light" disabled={savingId === `check-${order.dbId}`} onClick={() => refreshPayment(order)}>Проверить оплату</button>}
                </div>
              )}
              {order.deliveryType === 'moscow' && order.paymentStatus === 'paid' && (
                <button className="btn light" onClick={() => contactMoscowManager(order)}>Написать менеджеру по доставке</button>
              )}
              {order.trackNumber && <p>Трек СДЭК: <b>{order.trackNumber}</b></p>}
              {order.trackNumber && <a className="btn light" href={`https://www.cdek.ru/ru/tracking?order_id=${order.trackNumber}`} target="_blank">Отследить</a>}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
