import { getCdekOrderInfo, getOrderStatusFromCdekStatus } from '@/lib/cdek-server';
import { orderFromRow } from '@/lib/supabase-server';

export type AnySupabase = any;

export async function syncCdekOrderStatus(supabase: AnySupabase, order: any) {
  if (!order?.id) throw new Error('Заказ не найден');
  if (!order.cdek_order_uuid) {
    return {
      changed: false,
      skipped: true,
      reason: 'Отправление СДЭК ещё не создано',
      order: orderFromRow(order),
    };
  }

  const info = await getCdekOrderInfo(order.cdek_order_uuid);
  const patch = {
    cdek_tracking_number: info.cdekNumber || order.cdek_tracking_number || '',
    cdek_status: info.status.code || order.cdek_status || '',
    cdek_status_description: info.status.description || order.cdek_status_description || '',
    cdek_status_updated_at: new Date().toISOString(),
    order_status: getOrderStatusFromCdekStatus(info.status.code, info.status.description),
  };

  const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
  if (error) throw error;

  const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
  return {
    changed: true,
    skipped: false,
    order: orderFromRow(updated || { ...order, ...patch }),
    cdekStatus: patch.cdek_status,
    cdekStatusDescription: patch.cdek_status_description,
    trackNumber: patch.cdek_tracking_number,
  };
}
