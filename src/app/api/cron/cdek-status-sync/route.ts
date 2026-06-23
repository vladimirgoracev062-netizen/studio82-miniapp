import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { syncCdekOrderStatus } from '@/lib/cdek-status-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cronAllowed(request: Request) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  try {
    if (!cronAllowed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('delivery_type', 'cdek')
      .not('cdek_order_uuid', 'is', null)
      .not('cdek_order_uuid', 'eq', '')
      .not('order_status', 'in', '(Завершён,Оплата отменена,Оплата истекла)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const results: Array<any> = [];
    for (const order of orders || []) {
      try {
        const result = await syncCdekOrderStatus(supabase, order);
        results.push({ orderId: order.id, ok: true, status: result.cdekStatus, trackNumber: result.trackNumber });
      } catch (syncError: any) {
        results.push({ orderId: order.id, ok: false, error: syncError?.message || String(syncError) });
      }
    }

    return NextResponse.json({ ok: true, checked: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось синхронизировать статусы СДЭК' }, { status: 500 });
  }
}
