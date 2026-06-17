import { NextResponse } from 'next/server';
import { cdekRequest } from '@/lib/cdek-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RawCity = any;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‐‑‒–—-]/g, ' ')
    .replace(/[.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/\s+/g, '');
}

function titleCaseRu(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildCityQueries(query: string) {
  const raw = query.trim();
  const normalized = normalize(raw);
  const words = normalized.split(' ').filter(Boolean);
  const variants = new Set<string>();

  if (raw) variants.add(raw);
  if (normalized) variants.add(normalized);
  if (normalized) variants.add(titleCaseRu(normalized));

  // Ростов на дону -> Ростов-на-дону. Это помогает городам с дефисами.
  if (words.length > 1) {
    variants.add(words.join('-'));
    variants.add(titleCaseRu(words.join('-')));
  }

  // Ростов-на-Дону / Ростов на дону -> Ростов. Так СДЭК возвращает список вариантов.
  if (words[0] && words[0].length >= 3) {
    variants.add(words[0]);
    variants.add(titleCaseRu(words[0]));
  }

  // Частые пользовательские написания.
  const aliasMap: Record<string, string[]> = {
    'ростов надону': ['Ростов-на-Дону', 'Ростов'],
    'ростов на дону': ['Ростов-на-Дону', 'Ростов'],
    'ростовнадону': ['Ростов-на-Дону', 'Ростов'],
    'санкт петербург': ['Санкт-Петербург', 'Петербург'],
    'санктпетербург': ['Санкт-Петербург', 'Петербург'],
    'нижний новгород': ['Нижний Новгород'],
    'великий новгород': ['Великий Новгород'],
    'набережные челны': ['Набережные Челны'],
    'йошкар ола': ['Йошкар-Ола'],
    'йошкарола': ['Йошкар-Ола'],
    'усть кут': ['Усть-Кут'],
    'устькут': ['Усть-Кут'],
  };

  const aliasKey = compact(raw);
  const aliasKeySpaced = normalized;
  (aliasMap[aliasKey] || aliasMap[aliasKeySpaced] || []).forEach((item) => variants.add(item));

  return Array.from(variants).filter((item) => item.length >= 2).slice(0, 8);
}

function mapCity(item: RawCity) {
  return {
    code: Number(item.code),
    city: item.city || item.city_name || '',
    region: item.region || item.region_name || '',
    country: item.country || item.country_code || 'RU',
  };
}

function scoreCity(city: ReturnType<typeof mapCity>, query: string) {
  const q = normalize(query);
  const qCompact = compact(query);
  const cityName = normalize(city.city || '');
  const cityCompact = compact(city.city || '');
  const full = normalize(`${city.city || ''} ${city.region || ''}`);
  const fullCompact = compact(`${city.city || ''} ${city.region || ''}`);

  let score = 0;
  if (cityCompact === qCompact) score += 1000;
  if (cityName === q) score += 900;
  if (cityName.startsWith(q)) score += 500;
  if (cityCompact.startsWith(qCompact)) score += 450;
  if (full.includes(q)) score += 300;
  if (fullCompact.includes(qCompact)) score += 250;
  if (cityName.includes(q.split(' ')[0] || q)) score += 100;

  // Ростов-на-Дону чаще нужен пользователям, чем Ростов в Ярославской области.
  if (qCompact.includes('ростов') && cityCompact === 'ростовнадону') score += 700;

  return score;
}

async function fetchCitiesByQuery(query: string) {
  const params = new URLSearchParams();
  params.set('city', query);
  params.set('country_codes', 'RU');
  params.set('size', '30');
  const data = await cdekRequest(`/v2/location/cities?${params.toString()}`);
  return Array.isArray(data) ? data : [];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim();
    if (query.length < 2) return NextResponse.json({ cities: [] });

    const variants = buildCityQueries(query);
    const rawResults = (await Promise.allSettled(variants.map(fetchCitiesByQuery)))
      .flatMap((result) => result.status === 'fulfilled' ? result.value : []);

    const byCode = new Map<number, ReturnType<typeof mapCity>>();
    rawResults.map(mapCity).forEach((city) => {
      if (city.code && city.city) byCode.set(city.code, city);
    });

    const cities = Array.from(byCode.values())
      .map((city) => ({ ...city, score: scoreCity(city, query) }))
      .filter((city) => city.score > 0 || normalize(city.city).includes(normalize(query).split(' ')[0] || normalize(query)))
      .sort((a, b) => b.score - a.score || String(a.city).localeCompare(String(b.city), 'ru'))
      .slice(0, 20)
      .map(({ score, ...city }) => city);

    return NextResponse.json({ cities, query, variants });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось найти город СДЭК' }, { status: 500 });
  }
}
