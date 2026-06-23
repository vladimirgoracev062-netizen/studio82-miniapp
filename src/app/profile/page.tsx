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
  const [now, setNow] = useState(Date.now());

  function buildMoscowMessage(order: Order) {
    const items = order.items.map((item) => `• ${item.title}, размер ${item.size} × ${item.quantity}`).join('\n');
    return [
      `Здравствуйте! Я оплатил заказ STUDIO 82 №${order.id} и хочу согласовать бесплатную доставку по Москве.`,
      '',
      items,
      '',
      `ФИО: ${order.customerName}`,
      `Телефон: ${order.phone}`,
      order.telegramUsername ? `Telegram: @${order.telegramUsername}` : '',
      '',
      'Подскажите, пожалуйста, когда удобно согласовать курьера по Москве?',
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

function paymentLabel(status?: string) {
  if (status === 'paid') return 'оплачено';
  if (status === 'canceled') return 'отменена';
  if (status === 'expired') return 'время оплаты истекло';
  return 'ожидает оплаты';
}

function reservationLeftText(order: Order, now: number) {
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'canceled' || order.paymentStatus === 'expired') return '';
  if (!order.reservationExpiresAt) return '';
  const leftMs = new Date(order.reservationExpiresAt).getTime() - now;
  if (leftMs <= 0) return 'Время оплаты истекло. Товар вернётся в наличие.';
  const totalSec = Math.ceil(leftMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `Бронь действует ещё ${min}:${String(sec).padStart(2, '0')}`;
}


function cdekTrackingUrl(trackNumber: string) {
  return `https://www.cdek.ru/ru/tracking/?order_id=${encodeURIComponent(trackNumber)}`;
}

function isCdekOrder(order: Order) {
  return order.deliveryType !== 'moscow';
}

function canPayOrder(order: Order, now: number) {
  if (!order.dbId) return false;
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'canceled' || order.paymentStatus === 'expired') return false;
  if (order.reservationExpiresAt && new Date(order.reservationExpiresAt).getTime() <= now) return false;
  return true;
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



  async function refreshCdekForCustomer(order: Order) {
    if (!order.dbId) return;
    try {
      setActionMessage('');
      setSavingId(`cdek-${order.dbId}`);
      const updated = await refreshCdekOrderStatus(order.dbId);
      setOrders((current) => current.map((item) => (item.dbId === updated.dbId ? updated : item)));
      setActionMessage('Статус доставки обновлён.');
    } catch (err: any) {
      setActionMessage(err.message || 'Не удалось обновить статус доставки');
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
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
              {isCdekOrder(order) && (
                <p className="muted">
                  {order.cdekDeliveryMode === 'courier' ? 'СДЭК курьером' : 'СДЭК ПВЗ/постамат'} · {order.city}
                  {order.cdekPoint ? ` · ${order.cdekPoint}` : ''}
                </p>
              )}
              {order.cdekDeliveryPrice ? <p className="muted">Доставка СДЭК: {formatPrice(order.cdekDeliveryPrice)}</p> : null}
              <p className={order.paymentStatus === 'paid' ? 'success-text' : order.paymentStatus === 'expired' || order.paymentStatus === 'canceled' ? 'error-text' : 'muted'}>Оплата: {paymentLabel(order.paymentStatus)}</p>
              {reservationLeftText(order, now) ? <p className={reservationLeftText(order, now).includes('истекло') ? 'error-text' : 'muted'}>{reservationLeftText(order, now)}</p> : null}
              {isCdekOrder(order) ? (
                <div className="delivery-track-card">
                  <b>Доставка СДЭК</b>
                  <p className="muted">Статус: {order.cdekStatusDescription || order.cdekStatus || (order.cdekOrderUuid ? order.status : 'Ожидает создания отправления')}</p>
                  {order.trackNumber ? (
                    <>
                      <p>Трек СДЭК: <b>{order.trackNumber}</b></p>
                      <a className="btn light" href={cdekTrackingUrl(order.trackNumber)} target="_blank" rel="noreferrer">Отследить заказ</a>
                    </>
                  ) : (
                    <p className="muted">Трек-номер появится после создания и обработки отправления в СДЭК.</p>
                  )}
                  {order.cdekOrderUuid ? (
                    <button className="btn light" disabled={savingId === `cdek-${order.dbId}`} onClick={() => refreshCdekForCustomer(order)}>
                      {savingId === `cdek-${order.dbId}` ? 'Обновляем...' : 'Обновить статус доставки'}
                    </button>
                  ) : (
                    <p className="muted">После оплаты администратор создаст отправление, и здесь появятся статусы СДЭК.</p>
                  )}
                </div>
              ) : null}
              <b>{formatPrice(order.total)}</b>
              {canPayOrder(order, now) && (
                <div className="row">
                  <button className="btn" disabled={savingId === `pay-${order.dbId}`} onClick={() => payOrder(order)}>{savingId === `pay-${order.dbId}` ? 'Открываем...' : 'Оплатить'}</button>
                  {order.yookassaPaymentId && <button className="btn light" disabled={savingId === `check-${order.dbId}`} onClick={() => refreshPayment(order)}>Проверить оплату</button>}
                </div>
              )}
              {order.deliveryType === 'moscow' && order.paymentStatus === 'paid' && (
                <button className="btn light" onClick={() => contactMoscowManager(order)}>Написать менеджеру по доставке</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
