import { NextResponse } from 'next/server';
import { cdekRequest } from '@/lib/cdek-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RawCity = any;
type City = ReturnType<typeof mapCity>;

type CityCache = {
  cities: City[];
  loadedAt: number;
  loading?: Promise<City[]>;
};

type SearchCacheItem = { cities: City[]; loadedAt: number };

const searchCache = new Map<string, SearchCacheItem>();

const cityCache: CityCache = {
  cities: [],
  loadedAt: 0,
};

const CITY_CACHE_TTL = 12 * 60 * 60 * 1000;
const SEARCH_CACHE_TTL = 30 * 60 * 1000;
const CITY_DIRECT_TIMEOUT_MS = 2500;
const CITY_FULL_FALLBACK_TIMEOUT_MS = 1400;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
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

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function queryAliases(query: string) {
  const raw = query.trim();
  const normalized = normalize(raw);
  const key = compact(raw);
  const words = normalized.split(' ').filter(Boolean);
  const aliases = new Set<string>();

  if (raw) aliases.add(raw);
  if (normalized) aliases.add(normalized);
  if (normalized) aliases.add(titleCaseRu(normalized));
  if (words.length > 1) {
    aliases.add(words.join('-'));
    aliases.add(titleCaseRu(words.join('-')));
  }
  if (words[0]?.length >= 3) {
    aliases.add(words[0]);
    aliases.add(titleCaseRu(words[0]));
  }

  const aliasMap: Record<string, string[]> = {
    // Частые города с дефисами / пробелами / народными названиями.
    'ростов': ['Ростов-на-Дону', 'Ростов'],
    'ростовнадону': ['Ростов-на-Дону', 'Ростов'],
    'ростовнадон': ['Ростов-на-Дону'],
    'ростовдон': ['Ростов-на-Дону'],
    'ростовдонy': ['Ростов-на-Дону'],
    'ростовна': ['Ростов-на-Дону'],
    'санкт': ['Санкт-Петербург'],
    'санктпетербург': ['Санкт-Петербург', 'Петербург'],
    'петербург': ['Санкт-Петербург'],
    'спб': ['Санкт-Петербург'],
    'sankt': ['Санкт-Петербург'],
    'spb': ['Санкт-Петербург'],
    'piter': ['Санкт-Петербург'],
    'питер': ['Санкт-Петербург'],
    'нижний': ['Нижний Новгород', 'Нижний Тагил'],
    'нижнийновгород': ['Нижний Новгород'],
    'великийновгород': ['Великий Новгород'],
    'набережныечелны': ['Набережные Челны'],
    'йошкарола': ['Йошкар-Ола'],
    'устькут': ['Усть-Кут'],
    'устьилимск': ['Усть-Илимск'],
    'ореховозуево': ['Орехово-Зуево'],
    'комсомольскнаамуре': ['Комсомольск-на-Амуре'],
    'южносахалинск': ['Южно-Сахалинск'],
    'каменскуральский': ['Каменск-Уральский'],
    'ленинсккузнецкий': ['Ленинск-Кузнецкий'],
    'старыйоскол': ['Старый Оскол'],
    'новыйуренгой': ['Новый Уренгой'],
    'великиелуки': ['Великие Луки'],
    'минводы': ['Минеральные Воды'],
    'минеральныеводы': ['Минеральные Воды'],
  };

  (aliasMap[key] || aliasMap[normalized] || []).forEach((item) => aliases.add(item));

  return Array.from(aliases).filter((item) => item.length >= 2);
}

function mapCity(item: RawCity) {
  return {
    code: Number(item.code),
    city: item.city || item.city_name || '',
    region: item.region || item.region_name || '',
    country: item.country || item.country_code || 'RU',
  };
}

function scoreCity(city: City, query: string) {
  const q = normalize(query);
  const qCompact = compact(query);
  const qWords = q.split(' ').filter(Boolean);
  const firstWord = qWords[0] || q;
  const cityName = normalize(city.city || '');
  const cityCompact = compact(city.city || '');
  const full = normalize(`${city.city || ''} ${city.region || ''}`);
  const fullCompact = compact(`${city.city || ''} ${city.region || ''}`);
  const aliases = queryAliases(query).map((item) => compact(item));

  let score = 0;

  if (aliases.includes(cityCompact)) score += 1600;
  if (cityCompact === qCompact) score += 1400;
  if (cityName === q) score += 1200;
  if (cityName.startsWith(q)) score += 900;
  if (cityCompact.startsWith(qCompact)) score += 850;
  if (qWords.length > 1 && qWords.every((word) => full.includes(word))) score += 750;
  if (full.includes(q)) score += 650;
  if (fullCompact.includes(qCompact)) score += 600;
  if (firstWord.length >= 3 && cityName.startsWith(firstWord)) score += 500;
  if (firstWord.length >= 3 && cityName.includes(firstWord)) score += 320;
  if (firstWord.length >= 3 && full.includes(firstWord)) score += 180;

  // Частые неоднозначные запросы: выше показываем крупный город, который обычно ищет клиент.
  if (qCompact.includes('ростов') && cityCompact === 'ростовнадону') score += 1200;
  if ((qCompact === 'спб' || qCompact.includes('питер') || qCompact.includes('петербург') || qCompact.includes('санкт')) && cityCompact === 'санктпетербург') score += 1200;
  if (qCompact === 'новгород' && cityCompact === 'нижнийновгород') score += 400;

  return score;
}

async function fetchCitiesByQuery(query: string) {
  const params = new URLSearchParams();
  params.set('city', query);
  params.set('country_codes', 'RU');
  params.set('size', '100');
  const data = await cdekRequest(`/v2/location/cities?${params.toString()}`);
  return Array.isArray(data) ? data : [];
}

async function fetchAllRussianCities() {
  const now = Date.now();
  if (cityCache.cities.length && now - cityCache.loadedAt < CITY_CACHE_TTL) return cityCache.cities;
  if (cityCache.loading) return cityCache.loading;

  cityCache.loading = (async () => {
    const byCode = new Map<number, City>();
    const pageSize = 1000;

    // СДЭК поддерживает выдачу списка городов через location/cities. Забираем пачками и ищем локально,
    // чтобы не зависеть от дефисов и точного написания пользователя.
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams();
      params.set('country_codes', 'RU');
      params.set('size', String(pageSize));
      params.set('page', String(page));
      const data = await cdekRequest(`/v2/location/cities?${params.toString()}`).catch(() => []);
      if (!Array.isArray(data) || !data.length) break;

      data.map(mapCity).forEach((city) => {
        if (city.code && city.city) byCode.set(city.code, city);
      });

      if (data.length < pageSize) break;
    }

    const cities = Array.from(byCode.values());
    if (cities.length) {
      cityCache.cities = cities;
      cityCache.loadedAt = Date.now();
    }
    cityCache.loading = undefined;
    return cities;
  })();

  try {
    return await cityCache.loading;
  } catch (error) {
    cityCache.loading = undefined;
    return cityCache.cities;
  }
}

function normalizeResults(items: RawCity[], query: string) {
  const byCode = new Map<number, City>();
  items.map(mapCity).forEach((city) => {
    if (city.code && city.city) byCode.set(city.code, city);
  });

  return Array.from(byCode.values())
    .map((city) => ({ ...city, score: scoreCity(city, query) }))
    .filter((city) => city.score > 0)
    .sort((a, b) => b.score - a.score || String(a.city).localeCompare(String(b.city), 'ru'))
    .slice(0, 30)
    .map(({ score, ...city }) => city);
}

function mergeAndSortCities(query: string, ...lists: City[][]) {
  const merged = new Map<number, City>();
  lists.flat().forEach((city) => {
    if (city.code && city.city) merged.set(city.code, city);
  });

  return Array.from(merged.values())
    .map((city) => ({ ...city, score: scoreCity(city, query) }))
    .filter((city) => city.score > 0)
    .sort((a, b) => b.score - a.score || String(a.city).localeCompare(String(b.city), 'ru'))
    .slice(0, 30)
    .map(({ score, ...city }) => city);
}

function cacheKey(query: string) {
  return compact(query).slice(0, 80);
}

function getCachedSearch(query: string) {
  const key = cacheKey(query);
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.loadedAt > SEARCH_CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  return cached.cities;
}

function setCachedSearch(query: string, cities: City[]) {
  searchCache.set(cacheKey(query), { cities, loadedAt: Date.now() });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchCitiesByQuerySafe(query: string) {
  return withTimeout(fetchCitiesByQuery(query).catch(() => []), CITY_DIRECT_TIMEOUT_MS, [] as RawCity[]);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim();
    if (query.length < 2) return NextResponse.json({ cities: [] });

    const cached = getCachedSearch(query);
    if (cached) return NextResponse.json({ cities: cached, query, cached: true });

    // Важно для скорости: сначала спрашиваем СДЭК по конкретному запросу и его частым вариантам
    // написания. Раньше сначала загружался весь справочник городов РФ, из-за этого первый поиск
    // мог занимать слишком долго на странице оформления.
    const variants = uniq(queryAliases(query)).slice(0, 8);
    const rawResults = (await Promise.allSettled(variants.map(fetchCitiesByQuerySafe)))
      .flatMap((result) => result.status === 'fulfilled' ? result.value : []);

    let cities = normalizeResults(rawResults, query);

    // Если полный справочник уже загружен в памяти, дополняем результаты локальным fuzzy-поиском.
    if (cityCache.cities.length) {
      cities = mergeAndSortCities(query, cities, normalizeResults(cityCache.cities, query));
    } else {
      // Стартуем прогрев справочника, но не ждём его долго. Так пользователь быстро получает
      // ответы от прямого поиска, а следующие запросы в этом же окружении будут ещё быстрее.
      const fullCities = await withTimeout(fetchAllRussianCities(), cities.length ? 0 : CITY_FULL_FALLBACK_TIMEOUT_MS, [] as City[]);
      if (fullCities.length) {
        cities = mergeAndSortCities(query, cities, normalizeResults(fullCities, query));
      }
    }

    setCachedSearch(query, cities);
    return NextResponse.json({ cities, query, fast: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось найти город СДЭК' }, { status: 500 });
  }
}
