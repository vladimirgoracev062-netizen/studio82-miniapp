import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest } from '@/lib/supabase-server';
import { releaseExpiredReservations } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasSupabase()) return NextResponse.json({ ok: true, skipped: true });
    const result = await releaseExpiredReservations(getSupabaseAdmin());
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'Failed to release reservations' }, { status: 500 });
  }
}
