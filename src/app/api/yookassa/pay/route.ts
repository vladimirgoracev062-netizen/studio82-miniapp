import { NextResponse } from 'next/server';
import { createYookassaPayment, getYookassaPayment, normalizeYookassaStatus, paymentConfirmationUrl } from '@/lib/yookassa-server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import { getTelegramInitDataFromRequest, verifyTelegramInitData } from '@/lib/telegram-server';
import { applyYookassaPaymentToOrder, releaseExpiredReservations } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

function formatOrderNumber(row: any) {
  return String(row.order_number || row.id).replace(/-/g, '').slice(0, 8);
}


function cleanPaymentText(value: any) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[\n\r\t]+/g, ' ')
    .trim();
}

function compactBrand(value: string) {
  const text = cleanPaymentText(value);
  return text
    .replace(/^New Balance\b/i, 'NB')
    .replace(/^Nike\b/i, 'Nike')
    .replace(/^Mizuno\b/i, 'Mizuno')
    .replace(/^Adidas\b/i, 'Adidas')
    .replace(/^Converse\b/i, 'Converse');
}

function orderItemLine(item: any) {
  const title = compactBrand(item?.product_title || item?.title || 'Товар');
  const size = cleanPaymentText(item?.size);
  const quantity = Number(item?.quantity || 1);
  const sizePart = size ? ` р.${size}` : '';
  return `${title}${sizePart} ×${quantity}`;
}

function buildYookassaPaymentDescription(order: any, orderNumber: string) {
  const items = Array.isArray(order?.order_items) ? order.order_items : [];
  const prefix = `STUDIO 82 №${orderNumber}: `;
  const maxLength = 128;

  if (!items.length) return `Заказ STUDIO 82 №${orderNumber}`.slice(0, maxLength);

  const lines = items.map(orderItemLine).filter(Boolean);
  const full = `${prefix}${lines.join('; ')}`;
  if (full.length <= maxLength) return full;

  const result: string[] = [];
  for (const line of lines) {
    const left = lines.length - result.length;
    const suffix = left > 1 ? `; +${left - 1} поз.` : '';
    const candidate = `${prefix}${[...result, line].join('; ')}${suffix}`;
    if (candidate.length <= maxLength) {
      result.push(line);
    } else {
      break;
    }
  }

  if (result.length) {
    const remaining = lines.length - result.length;
    const suffix = remaining > 0 ? `; +${remaining} поз.` : '';
    return `${prefix}${result.join('; ')}${suffix}`.slice(0, maxLength);
  }

  return `${prefix}${lines[0]}`.slice(0, maxLength);
}

function getReturnUrl(request: Request, orderId: string) {
  const configReturnUrl = (process.env.YOOKASSA_RETURN_URL || '').trim();
  if (configReturnUrl) return configReturnUrl;
  const origin = new URL(request.url).origin;
  return `${origin}/profile?payment=return&order=${encodeURIComponent(orderId)}`;
}

async function updatePaymentStatus(orderDbId: string, payment: any, origin: string) {
  const updated = await applyYookassaPaymentToOrder(getSupabaseAdmin(), orderDbId, payment, origin);
  return updated;
}

export async function POST(request: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ error: 'Supabase не настроен' }, { status: 500 });
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || '').trim();
    if (!orderId) return NextResponse.json({ error: 'Не найден ID заказа' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    await releaseExpiredReservations(supabase);
    const admin = isAdminRequest(request);
    const telegramUser = admin ? null : verifyTelegramInitData(getTelegramInitDataFromRequest(request) || body.telegramInitData || '');
    if (!admin && !telegramUser?.id) {
      return NextResponse.json({ error: 'Откройте приложение через Telegram, чтобы оплатить заказ' }, { status: 401 });
    }

    let query = supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    const { data: order, error } = await query;
    if (error || !order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    if (!admin && String(order.telegram_id) !== String(telegramUser?.id)) {
      return NextResponse.json({ error: 'Нет доступа к этому заказу' }, { status: 403 });
    }

    if (order.payment_status === 'expired' || order.stock_released_at) {
      return NextResponse.json({ error: 'Время брони истекло. Создайте заказ заново, чтобы проверить актуальное наличие.' }, { status: 400 });
    }
    if (order.reservation_expires_at && new Date(order.reservation_expires_at).getTime() < Date.now()) {
      await releaseExpiredReservations(supabase);
      return NextResponse.json({ error: 'Время брони истекло. Товар возвращён в наличие.' }, { status: 400 });
    }

    const orderNumber = formatOrderNumber(order);
    const amount = Number(order.total_amount || 0);
    if (amount <= 0) return NextResponse.json({ error: 'Некорректная сумма заказа' }, { status: 400 });

    if (order.payment_status === 'paid') {
      return NextResponse.json({ paid: true, order: orderFromRow(order) });
    }

    if (order.yookassa_payment_id) {
      const existingPayment = await getYookassaPayment(order.yookassa_payment_id);
      await updatePaymentStatus(order.id, existingPayment, new URL(request.url).origin);
      const status = normalizeYookassaStatus(existingPayment?.status);
      const confirmationUrl = paymentConfirmationUrl(existingPayment) || order.yookassa_payment_url || '';
      if (status === 'paid') {
        const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
        return NextResponse.json({ paid: true, order: orderFromRow(updated || order) });
      }
      if (confirmationUrl && status !== 'canceled') {
        const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
        return NextResponse.json({ confirmationUrl, paymentId: existingPayment.id, order: orderFromRow(updated || order) });
      }
    }

    const payment = await createYookassaPayment({
      orderDbId: order.id,
      orderNumber,
      amount,
      description: buildYookassaPaymentDescription(order, orderNumber),
      returnUrl: getReturnUrl(request, order.id),
      customerName: order.customer_name || '',
      customerPhone: order.customer_phone || '',
      deliveryType: order.delivery_type || '',
    });

    await updatePaymentStatus(order.id, payment, new URL(request.url).origin);
    const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
    const confirmationUrl = paymentConfirmationUrl(payment);
    return NextResponse.json({ confirmationUrl, paymentId: payment.id, order: orderFromRow(updated || order) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось создать платеж ЮKassa' }, { status: 500 });
  }
}
