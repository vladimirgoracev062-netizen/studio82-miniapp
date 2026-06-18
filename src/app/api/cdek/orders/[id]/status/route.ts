import { NextResponse } from 'next/server';
import { syncCdekOrderStatus } from '@/lib/cdek-status-sync';
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

    if (!order.cdek_order_uuid) {
      return NextResponse.json({ ok: true, skipped: true, order: orderFromRow(order), message: 'Отправление СДЭК ещё не создано' });
    }

    const result = await syncCdekOrderStatus(supabase, order);
    return NextResponse.json({ ok: true, order: (result as any).order || orderFromRow(order) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось обновить статус СДЭК' }, { status: 500 });
  }
}
