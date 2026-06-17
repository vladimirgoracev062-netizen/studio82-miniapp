import { NextResponse } from 'next/server';
import { cdekRequest, getCdekConfig, getCdekPackageForPairs, hasCdekCredentials } from '@/lib/cdek-server';
import { ADMIN_PASSWORD } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if ((url.searchParams.get('password') || '') !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const config = getCdekConfig();
    if (!hasCdekCredentials()) {
      return NextResponse.json({ ok: false, error: 'CDEK_CLIENT_ID или CDEK_CLIENT_SECRET не добавлены', config: { baseUrl: config.baseUrl, fromCityCode: config.fromCityCode } }, { status: 500 });
    }

    const params = new URLSearchParams();
    params.set('city', 'Москва');
    params.set('country_codes', 'RU');
    params.set('size', '1');
    const cities = await cdekRequest(`/v2/location/cities?${params.toString()}`);

    return NextResponse.json({
      ok: true,
      baseUrl: config.baseUrl,
      fromCityCode: config.fromCityCode,
      senderAddress: config.senderAddress,
      hasSenderPhone: Boolean(config.senderPhone),
      deliveryMarkupPerPair: config.deliveryMarkupPerPair,
      onePairPackage: getCdekPackageForPairs(1),
      twoPairsPackage: getCdekPackageForPairs(2),
      threePairsPackage: getCdekPackageForPairs(3),
      fivePairsPackage: getCdekPackageForPairs(5),
      sampleCity: Array.isArray(cities) ? cities[0] : null,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'CDEK test failed' }, { status: 500 });
  }
}
