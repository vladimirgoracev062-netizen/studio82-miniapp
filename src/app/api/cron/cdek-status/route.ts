import { NextResponse } from 'next/server';
import { syncActiveCdekOrders } from '@/lib/cdek-status-sync';
import { getSupabaseAdmin, hasSupabase, isAdminRequest } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  if (isAdminRequest(request)) return true;
  const secret = (process.env.CDEK_CRON_SECRET || process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || '';
  const auth = request.headers.get('authorization') || '';
  return querySecret === secret || auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasSupabase()) return NextResponse.json({ ok: true, skipped: true, reason: 'Supabase не настроен' });

    const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get('limit') || 50)));
    const result = await syncActiveCdekOrders(getSupabaseAdmin(), limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[cdek cron] error', error);
    return NextResponse.json({ ok: false, error: error.message || 'Не удалось обновить статусы СДЭК' }, { status: 500 });
  }
}
