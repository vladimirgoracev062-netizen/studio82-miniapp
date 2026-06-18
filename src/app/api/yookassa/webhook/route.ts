import { NextResponse } from 'next/server';
import { getYookassaConfig, getYookassaPayment, normalizeYookassaStatus } from '@/lib/yookassa-server';
import { getSupabaseAdmin, hasSupabase } from '@/lib/supabase-server';
import { applyYookassaPaymentToOrder } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const config = getYookassaConfig();
    if (config.webhookSecret) {
      const url = new URL(request.url);
      const secret = url.searchParams.get('secret') || request.headers.get('x-yookassa-webhook-secret') || '';
      if (secret !== config.webhookSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasSupabase()) return NextResponse.json({ ok: true, skipped: true });
    const body = await request.json().catch(() => ({}));
    const paymentId = String(body?.object?.id || body?.payment_id || '').trim();
    if (!paymentId) return NextResponse.json({ ok: true, skipped: true });

    const payment = await getYookassaPayment(paymentId);
    const status = normalizeYookassaStatus(payment?.status);
    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase.from('orders').select('id').eq('yookassa_payment_id', paymentId).maybeSingle();
    if (!order?.id) return NextResponse.json({ ok: true, skipped: true });

    await applyYookassaPaymentToOrder(supabase, order.id, payment, new URL(request.url).origin);
    return NextResponse.json({ ok: true, paymentStatus: status });
  } catch (error: any) {
    console.error('[yookassa webhook] error', error);
    return NextResponse.json({ ok: false, error: error.message || 'Webhook error' }, { status: 200 });
  }
}
