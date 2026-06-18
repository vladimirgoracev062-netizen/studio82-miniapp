import type { SupabaseClient } from '@supabase/supabase-js';
import { orderFromRow } from '@/lib/supabase-server';

export const RESERVATION_MINUTES = Number(process.env.ORDER_RESERVATION_MINUTES || 10);

type AnySupabase = SupabaseClient<any, any, any>;

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value || 0) + ' ₽';
}

function deliveryLabel(value?: string, mode?: string) {
  if (value === 'moscow') return 'Доставка по Москве';
  if (value === 'cdek' && mode === 'courier') return 'СДЭК / курьер';
  return 'СДЭК / ПВЗ';
}

function getTelegramEnv() {
  return {
    token: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim(),
  };
}

function buildPaidOrderText(orderRow: any, origin: string) {
  const order = orderFromRow(orderRow);
  const items = order.items
    .map((item) => `• ${item.title}\n  Размер: ${item.size}\n  Количество: ${item.quantity}\n  Цена: ${formatRub(item.price)}`)
    .join('\n\n');

  return [
    '✅ Оплачен заказ STUDIO 82',
    '',
    `Заказ №${order.id}`,
    `Сумма: ${formatRub(order.total)}`,
    order.paidAt ? `Оплачен: ${new Date(order.paidAt).toLocaleString('ru-RU')}` : '',
    '',
    'Клиент:',
    order.customerName ? `ФИО: ${order.customerName}` : '',
    order.phone ? `Телефон: ${order.phone}` : '',
    order.telegramUsername ? `Telegram: @${order.telegramUsername}` : '',
    '',
    'Доставка:',
    deliveryLabel(order.deliveryType, order.cdekDeliveryMode),
    order.city ? `Город: ${order.city}` : '',
    order.cdekPoint ? `ПВЗ/адрес: ${order.cdekPoint}` : '',
    order.deliveryType === 'cdek' && order.cdekDeliveryPrice ? `Стоимость доставки: ${formatRub(order.cdekDeliveryPrice)}` : '',
    '',
    'Товары:',
    items,
    '',
    `Админка: ${origin}/admin`,
  ].filter(Boolean).join('\n');
}

async function notifyAdminPaidOrder(orderRow: any, origin: string) {
  const { token, chatId } = getTelegramEnv();
  if (!token || !chatId) return { ok: false, skipped: true, error: 'Telegram env variables are missing' };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildPaidOrderText(orderRow, origin),
      disable_web_page_preview: true,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok === false) {
    console.error('[telegram paid notification] error', body);
    return { ok: false, telegramStatus: response.status, telegramBody: body };
  }
  return { ok: true };
}

export function reservationExpiresAt(now = new Date()) {
  return new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000).toISOString();
}

async function incrementStock(supabase: AnySupabase, productId: string, size: string, quantity: number) {
  if (!productId || !size || quantity <= 0) return;
  const { data: current } = await supabase
    .from('product_sizes')
    .select('stock')
    .eq('product_id', productId)
    .eq('size', size)
    .maybeSingle();
  const nextStock = Number(current?.stock || 0) + Number(quantity || 0);
  await supabase
    .from('product_sizes')
    .update({ stock: nextStock })
    .eq('product_id', productId)
    .eq('size', size);
}

export async function releaseStockForOrder(supabase: AnySupabase, orderRow: any, reason: 'expired' | 'canceled' = 'expired') {
  if (!orderRow?.id) return { released: false, reason: 'missing_order' };
  if (orderRow.stock_released_at) return { released: false, reason: 'already_released' };
  if (String(orderRow.payment_status || '') === 'paid') return { released: false, reason: 'already_paid' };

  const items = orderRow.order_items || [];
  for (const item of items) {
    await incrementStock(supabase, item.product_id, item.size, Number(item.quantity || 1));
  }

  const now = new Date().toISOString();
  await supabase
    .from('orders')
    .update({
      stock_released_at: now,
      payment_status: reason === 'canceled' ? 'canceled' : 'expired',
      order_status: reason === 'canceled' ? 'Оплата отменена' : 'Оплата истекла',
      yookassa_payment_url: null,
    })
    .eq('id', orderRow.id);

  return { released: true };
}

export async function releaseExpiredReservations(supabase: AnySupabase) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .is('stock_released_at', null)
    .neq('payment_status', 'paid')
    .lt('reservation_expires_at', now)
    .limit(50);

  if (error) {
    console.warn('[reservations] failed to load expired reservations', error.message);
    return { checked: false, released: 0, error: error.message };
  }

  let released = 0;
  for (const order of data || []) {
    const result = await releaseStockForOrder(supabase, order, 'expired');
    if (result.released) released += 1;
  }

  return { checked: true, released };
}

export async function applyYookassaPaymentToOrder(supabase: AnySupabase, orderId: string, payment: any, origin: string) {
  const status = payment?.status === 'succeeded'
    ? 'paid'
    : payment?.status === 'canceled'
      ? 'canceled'
      : payment?.status === 'waiting_for_capture'
        ? 'waiting_capture'
        : 'waiting_payment';

  const { data: orderBefore } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle();
  if (!orderBefore?.id) return null;

  if (status === 'canceled') {
    await releaseStockForOrder(supabase, orderBefore, 'canceled');
  }

  const patch: Record<string, any> = {
    payment_status: status,
    yookassa_payment_id: payment?.id || orderBefore.yookassa_payment_id || null,
    yookassa_payment_url: payment?.confirmation?.confirmation_url || orderBefore.yookassa_payment_url || null,
  };

  if (status === 'paid') {
    patch.payment_status = 'paid';
    patch.order_status = 'Оплачен';
    patch.paid_at = orderBefore.paid_at || new Date().toISOString();
    patch.yookassa_payment_url = null;
  }

  if (status === 'canceled') {
    patch.payment_status = 'canceled';
    patch.order_status = 'Оплата отменена';
    patch.yookassa_payment_url = null;
  }

  await supabase.from('orders').update(patch).eq('id', orderId);
  const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();

  if (status === 'paid' && updated && !updated.admin_payment_notified_at) {
    const notification = await notifyAdminPaidOrder(updated, origin).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if ((notification as any)?.ok) {
      const notifiedAt = new Date().toISOString();
      await supabase.from('orders').update({ admin_payment_notified_at: notifiedAt }).eq('id', orderId);
      updated.admin_payment_notified_at = notifiedAt;
    }
  }

  return updated;
}
