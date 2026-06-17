import { NextResponse } from 'next/server';
import { getCdekOrderInfo } from '@/lib/cdek-server';
import { getSupabaseAdmin, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import { getTelegramInitDataFromRequest, verifyTelegramInitData } from '@/lib/telegram-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function canReadOrder(request: Request, order: any) {
  if (isAdminRequest(request)) return true;
  const telegramUser = verifyTelegramInitData(getTelegramInitDataFromRequest(request));
  return Boolean(telegramUser?.id && String(telegramUser.id) === String(order.telegram_id));
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', params.id).single();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    if (!(await canReadOrder(request, order))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!order.cdek_order_uuid) return NextResponse.json({ error: 'Отправление СДЭК ещё не создано' }, { status: 400 });

    const info = await getCdekOrderInfo(order.cdek_order_uuid);
    const patch = {
      cdek_tracking_number: info.cdekNumber || order.cdek_tracking_number || '',
      cdek_status: info.status.code || order.cdek_status || '',
      cdek_status_description: info.status.description || order.cdek_status_description || '',
      cdek_status_updated_at: new Date().toISOString(),
    };

    const update = await supabase.from('orders').update(patch).eq('id', params.id);
    if (update.error) throw update.error;

    const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', params.id).single();
    return NextResponse.json({ ok: true, order: orderFromRow(updated || { ...order, ...patch }) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось обновить статус СДЭК' }, { status: 500 });
  }
}
