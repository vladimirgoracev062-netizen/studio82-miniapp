import { NextResponse } from 'next/server';
import { getYookassaPayment, normalizeYookassaStatus, paymentConfirmationUrl } from '@/lib/yookassa-server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import { getTelegramInitDataFromRequest, verifyTelegramInitData } from '@/lib/telegram-server';
import { applyYookassaPaymentToOrder, releaseExpiredReservations } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

async function applyPaymentStatus(orderDbId: string, payment: any, origin: string) {
  return applyYookassaPaymentToOrder(getSupabaseAdmin(), orderDbId, payment, origin);
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
    if (!admin && !telegramUser?.id) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });

    const { data: order, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if (error || !order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    if (!admin && String(order.telegram_id) !== String(telegramUser?.id)) return NextResponse.json({ error: 'Нет доступа к этому заказу' }, { status: 403 });
    if (!order.yookassa_payment_id) return NextResponse.json({ order: orderFromRow(order), paymentStatus: order.payment_status || 'pending' });

    const payment = await getYookassaPayment(order.yookassa_payment_id);
    await applyPaymentStatus(order.id, payment, new URL(request.url).origin);
    const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
    return NextResponse.json({ order: orderFromRow(updated || order), paymentStatus: normalizeYookassaStatus(payment?.status), payment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось проверить оплату ЮKassa' }, { status: 500 });
  }
}
