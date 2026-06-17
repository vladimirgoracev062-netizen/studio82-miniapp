import { NextResponse } from 'next/server';
import { getYookassaConfig, getYookassaMe, hasYookassaCredentials, yookassaCredentialsDiagnostics } from '@/lib/yookassa-server';
import { isAdminRequest } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const password = url.searchParams.get('password') || '';
    const checkApi = url.searchParams.get('checkApi') !== '0';
    const adminHeader = new Headers(request.headers);
    if (password) adminHeader.set('x-admin-password', password);
    const fakeRequest = new Request(request.url, { headers: adminHeader });
    if (!isAdminRequest(fakeRequest)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const config = getYookassaConfig();
    const diagnostics = yookassaCredentialsDiagnostics();
    let apiAuth: any = { checked: false };

    if (checkApi && hasYookassaCredentials()) {
      try {
        const me = await getYookassaMe();
        apiAuth = {
          checked: true,
          ok: true,
          accountId: me?.account_id || me?.id || null,
          test: me?.test ?? null,
          status: me?.status || null,
        };
      } catch (error: any) {
        apiAuth = {
          checked: true,
          ok: false,
          error: error?.message || 'ЮKassa auth check failed',
        };
      }
    }

    return NextResponse.json({
      ok: hasYookassaCredentials() && (!apiAuth.checked || apiAuth.ok),
      hasShopId: Boolean(config.shopId),
      hasSecretKey: Boolean(config.secretKey),
      apiUrl: config.apiUrl,
      returnUrl: config.returnUrl || '(auto)',
      webhookSecret: Boolean(config.webhookSecret),
      diagnostics,
      apiAuth,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'YooKassa test failed' }, { status: 500 });
  }
}
