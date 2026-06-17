import { NextResponse } from 'next/server';
import { cdekRequest } from '@/lib/cdek-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cityCode = Number(url.searchParams.get('cityCode') || 0);
    if (!cityCode) return NextResponse.json({ error: 'Выберите город СДЭК' }, { status: 400 });

    const params = new URLSearchParams();
    params.set('city_code', String(cityCode));
    params.set('is_handout', 'true');

    const data = await cdekRequest(`/v2/deliverypoints?${params.toString()}`);
    const points = (Array.isArray(data) ? data : []).map((item: any) => ({
      code: item.code || '',
      name: item.name || item.code || 'ПВЗ СДЭК',
      type: item.type || '',
      address: item.location?.address || item.address || '',
      workTime: item.work_time || '',
      note: item.note || '',
      nearestStation: item.nearest_station || '',
      latitude: item.location?.latitude || null,
      longitude: item.location?.longitude || null,
    })).filter((item: any) => item.code && item.address).slice(0, 40);

    return NextResponse.json({ points });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось загрузить ПВЗ СДЭК' }, { status: 500 });
  }
}
