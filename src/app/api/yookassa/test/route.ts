import { NextResponse } from 'next/server';
import { getYookassaConfig, hasYookassaCredentials } from '@/lib/yookassa-server';
import { isAdminRequest } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const password = url.searchParams.get('password') || '';
    const adminHeader = new Headers(request.headers);
    if (password) adminHeader.set('x-admin-password', password);
    const fakeRequest = new Request(request.url, { headers: adminHeader });
    if (!isAdminRequest(fakeRequest)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const config = getYookassaConfig();
    return NextResponse.json({
      ok: hasYookassaCredentials(),
      hasShopId: Boolean(config.shopId),
      hasSecretKey: Boolean(config.secretKey),
      apiUrl: config.apiUrl,
      returnUrl: config.returnUrl || '(auto)',
      webhookSecret: Boolean(config.webhookSecret),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'YooKassa test failed' }, { status: 500 });
  }
}
