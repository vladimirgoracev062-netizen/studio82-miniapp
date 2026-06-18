import type { SupabaseClient } from '@supabase/supabase-js';
import { getCdekOrderInfo, getOrderStatusFromCdekStatus } from '@/lib/cdek-server';
import { orderFromRow } from '@/lib/supabase-server';

type AnySupabase = SupabaseClient<any, any, any>;

export async function syncCdekOrderStatus(supabase: AnySupabase, order: any) {
  if (!order?.id) return { ok: false, skipped: true, reason: 'missing_order' };
  if (!order.cdek_order_uuid) return { ok: false, skipped: true, reason: 'missing_cdek_order_uuid' };

  const info = await getCdekOrderInfo(order.cdek_order_uuid);
  const patch = {
    cdek_tracking_number: info.cdekNumber || order.cdek_tracking_number || order.cdek_number || '',
    cdek_status: info.status.code || order.cdek_status || '',
    cdek_status_description: info.status.description || order.cdek_status_description || '',
    cdek_status_updated_at: new Date().toISOString(),
    order_status: getOrderStatusFromCdekStatus(info.status.code, info.status.description),
  };

  const update = await supabase.from('orders').update(patch).eq('id', order.id);
  if (update.error) throw update.error;

  const { data: updated, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
  if (error) throw error;

  return { ok: true, order: orderFromRow(updated || { ...order, ...patch }), patch };
}

export async function syncActiveCdekOrders(supabase: AnySupabase, limit = 50) {
  const finalStatuses = ['Завершён', 'Оплата отменена', 'Оплата истекла'];
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('delivery_type', 'cdek')
    .not('cdek_order_uuid', 'is', null)
    .not('order_status', 'in', `(${finalStatuses.map((item) => `"${item}"`).join(',')})`)
    .order('cdek_status_updated_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;

  const results: Array<{ id: string; ok: boolean; error?: string; status?: string }> = [];
  for (const order of data || []) {
    try {
      const result = await syncCdekOrderStatus(supabase, order);
      results.push({ id: order.id, ok: Boolean(result.ok), status: (result as any).patch?.order_status });
    } catch (error: any) {
      console.error('[cdek cron] failed to sync order', order.id, error);
      results.push({ id: order.id, ok: false, error: error?.message || String(error) });
    }
  }

  return { checked: data?.length || 0, results };
}
