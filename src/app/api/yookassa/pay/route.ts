import { NextResponse } from 'next/server';
import { createYookassaPayment, getYookassaPayment, normalizeYookassaStatus, paymentConfirmationUrl } from '@/lib/yookassa-server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import { getTelegramInitDataFromRequest, verifyTelegramInitData } from '@/lib/telegram-server';

export const dynamic = 'force-dynamic';

function formatOrderNumber(row: any) {
  return String(row.order_number || row.id).replace(/-/g, '').slice(0, 8);
}

function getReturnUrl(request: Request, orderId: string) {
  const configReturnUrl = (process.env.YOOKASSA_RETURN_URL || '').trim();
  if (configReturnUrl) return configReturnUrl;
  const origin = new URL(request.url).origin;
  return `${origin}/profile?payment=return&order=${encodeURIComponent(orderId)}`;
}

async function updatePaymentStatus(orderDbId: string, payment: any) {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeYookassaStatus(payment?.status);
  const patch: Record<string, any> = {
    payment_status: normalized,
    yookassa_payment_id: payment?.id || null,
    yookassa_payment_url: paymentConfirmationUrl(payment) || null,
  };
  if (normalized === 'paid') {
    patch.payment_status = 'paid';
    patch.order_status = 'Оплачен';
    patch.paid_at = new Date().toISOString();
  }
  await supabase.from('orders').update(patch).eq('id', orderDbId);
}

export async function POST(request: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ error: 'Supabase не настроен' }, { status: 500 });
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || '').trim();
    if (!orderId) return NextResponse.json({ error: 'Не найден ID заказа' }, { status: 400 });

    const supabase = getSupabaseAdmin();
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

    const orderNumber = formatOrderNumber(order);
    const amount = Number(order.total_amount || 0);
    if (amount <= 0) return NextResponse.json({ error: 'Некорректная сумма заказа' }, { status: 400 });

    if (order.payment_status === 'paid') {
      return NextResponse.json({ paid: true, order: orderFromRow(order) });
    }

    if (order.yookassa_payment_id) {
      const existingPayment = await getYookassaPayment(order.yookassa_payment_id);
      await updatePaymentStatus(order.id, existingPayment);
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
      description: `Заказ STUDIO 82 №${orderNumber}`,
      returnUrl: getReturnUrl(request, order.id),
      customerName: order.customer_name || '',
      customerPhone: order.customer_phone || '',
      deliveryType: order.delivery_type || '',
    });

    await updatePaymentStatus(order.id, payment);
    const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
    const confirmationUrl = paymentConfirmationUrl(payment);
    return NextResponse.json({ confirmationUrl, paymentId: payment.id, order: orderFromRow(updated || order) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось создать платеж ЮKassa' }, { status: 500 });
  }
}
