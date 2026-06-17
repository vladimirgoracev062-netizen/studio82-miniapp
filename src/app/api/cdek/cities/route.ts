import { NextResponse } from 'next/server';
import { cdekRequest } from '@/lib/cdek-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim();
    if (query.length < 2) return NextResponse.json({ cities: [] });

    const params = new URLSearchParams();
    params.set('city', query);
    params.set('country_codes', 'RU');
    params.set('size', '12');

    const data = await cdekRequest(`/v2/location/cities?${params.toString()}`);
    const cities = (Array.isArray(data) ? data : []).map((item: any) => ({
      code: Number(item.code),
      city: item.city || item.city_name || '',
      region: item.region || item.region_name || '',
      country: item.country || item.country_code || 'RU',
    })).filter((item: any) => item.code && item.city);

    return NextResponse.json({ cities });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось найти город СДЭК' }, { status: 500 });
  }
}
