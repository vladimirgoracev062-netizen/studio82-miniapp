import { NextResponse } from 'next/server';
import { cdekRequest, getCdekConfig, getCdekTariffCode, getDefaultCdekPackage, type CdekDeliveryMode } from '@/lib/cdek-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = (body.mode || 'pickup') as CdekDeliveryMode;
    const cityCode = Number(body.cityCode || 0);
    const address = String(body.address || '').trim();

    if (!cityCode) return NextResponse.json({ error: 'Выберите город СДЭК' }, { status: 400 });
    if (mode === 'courier' && address.length < 5) return NextResponse.json({ error: 'Укажите адрес для курьерской доставки' }, { status: 400 });

    const config = getCdekConfig();
    const tariffCode = getCdekTariffCode(mode);
    const payload: any = {
      tariff_code: tariffCode,
      from_location: { code: config.fromCityCode },
      to_location: { code: cityCode },
      packages: [getDefaultCdekPackage()],
    };

    if (mode === 'courier') payload.to_location.address = address;

    const data = await cdekRequest('/v2/calculator/tariff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return NextResponse.json({
      result: {
        deliverySum: Math.round(Number(data.delivery_sum || data.total_sum || 0)),
        periodMin: data.period_min ?? null,
        periodMax: data.period_max ?? null,
        tariffCode,
        currency: data.currency || 'RUB',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось рассчитать доставку СДЭК' }, { status: 500 });
  }
}
