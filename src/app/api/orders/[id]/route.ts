import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminRequest } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (body.status) patch.order_status = body.status;
    if (body.trackNumber !== undefined) patch.cdek_tracking_number = body.trackNumber;
    if (body.paymentStatus) patch.payment_status = body.paymentStatus;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('orders').update(patch).eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update order' }, { status: 500 });
  }
}
