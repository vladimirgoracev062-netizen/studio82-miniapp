export type CdekDeliveryMode = 'pickup' | 'courier';

type CdekTokenCache = {
  token: string;
  expiresAt: number;
};

const tokenCache: CdekTokenCache = {
  token: '',
  expiresAt: 0,
};

function cleanBaseUrl(value?: string) {
  const raw = (value || 'https://api.edu.cdek.ru').trim().replace(/\/$/, '');
  return raw.endsWith('/v2') ? raw.slice(0, -3) : raw;
}

export function getCdekConfig() {
  return {
    baseUrl: cleanBaseUrl(process.env.CDEK_BASE_URL),
    clientId: (process.env.CDEK_CLIENT_ID || '').trim(),
    clientSecret: (process.env.CDEK_CLIENT_SECRET || '').trim(),
    fromCityCode: Number(process.env.CDEK_FROM_CITY_CODE || 44),
    packageWeight: Number(process.env.CDEK_PACKAGE_WEIGHT_GRAMS || 1500),
    packageLength: Number(process.env.CDEK_PACKAGE_LENGTH_CM || 40),
    packageWidth: Number(process.env.CDEK_PACKAGE_WIDTH_CM || 20),
    packageHeight: Number(process.env.CDEK_PACKAGE_HEIGHT_CM || 15),
    deliveryMarkupPerPair: Number(process.env.CDEK_DELIVERY_MARKUP_PER_PAIR || 0),
    declaredValueRate: Number(process.env.CDEK_DECLARED_VALUE_RATE || 0.0075),
    includeVat: (process.env.CDEK_INCLUDE_VAT || 'true').trim().toLowerCase() !== 'false',
    vatRate: Number(process.env.CDEK_VAT_RATE || 0.22),
    senderAddress: (process.env.CDEK_SENDER_ADDRESS || 'Москва, улица Пришвина 26').trim(),
    senderName: (process.env.CDEK_SENDER_NAME || 'STUDIO 82').trim(),
    senderPhone: (process.env.CDEK_SENDER_PHONE || '').trim(),
    shipmentPointCode: (process.env.CDEK_SHIPMENT_POINT_CODE || 'MSK1305').trim(),
  };
}

export function hasCdekCredentials() {
  const config = getCdekConfig();
  return Boolean(config.clientId && config.clientSecret);
}

async function getCdekToken() {
  const config = getCdekConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error('СДЭК не настроен: добавьте CDEK_CLIENT_ID и CDEK_CLIENT_SECRET в Vercel');
  }

  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);

  const response = await fetch(`${config.baseUrl}/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    console.error('[cdek] token error', data);
    throw new Error(data?.message || data?.error_description || 'СДЭК не выдал access token. Проверьте ключи интеграции.');
  }

  const expiresIn = Number(data.expires_in || 3600);
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = now + Math.max(60, expiresIn - 60) * 1000;
  return tokenCache.token;
}

function collectCdekErrors(data: any) {
  const parts: string[] = [];

  if (!data) return parts;
  if (typeof data === 'string') return [data];

  if (data.message) parts.push(String(data.message));
  if (data.error_description) parts.push(String(data.error_description));
  if (data.error) parts.push(String(data.error));

  const topErrors = Array.isArray(data.errors) ? data.errors : [];
  topErrors.forEach((item: any) => {
    const code = item?.code ? `${item.code}: ` : '';
    const message = item?.message || item?.description || item?.text;
    if (message) parts.push(`${code}${message}`);
  });

  const requests = Array.isArray(data.requests) ? data.requests : [];
  requests.forEach((request: any) => {
    const errors = Array.isArray(request?.errors) ? request.errors : [];
    errors.forEach((item: any) => {
      const code = item?.code ? `${item.code}: ` : '';
      const message = item?.message || item?.description || item?.text;
      if (message) parts.push(`${code}${message}`);
    });
  });

  return Array.from(new Set(parts.filter(Boolean)));
}

export function getCdekErrorMessage(data: any, fallback = 'Ошибка СДЭК API') {
  const errors = collectCdekErrors(data);
  return errors.length ? errors.join(' | ') : fallback;
}

export async function cdekRequest(path: string, init: RequestInit = {}) {
  const config = getCdekConfig();
  const token = await getCdekToken();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('[cdek] request error', { path, status: response.status, data });
    const message = getCdekErrorMessage(data, 'Ошибка СДЭК API');
    throw new Error(`СДЭК API ${response.status}: ${message}`);
  }

  return data;
}

export function getCdekTariffCode(mode: CdekDeliveryMode) {
  // 136 — Посылка склад-склад, 137 — Посылка склад-дверь.
  // Логика STUDIO 82: магазин сам сдаёт заказ в пункт СДЭК в Москве.
  return mode === 'courier' ? 137 : 136;
}

type CdekBox = {
  type: 'L' | 'XL';
  pairs: number;
  weight: number;
  length: number;
  width: number;
  height: number;
};

const CDEK_BOXES = {
  L: { type: 'L' as const, length: 31, width: 25, height: 38, maxPairs: 1 },
  XL: { type: 'XL' as const, length: 60, width: 35, height: 30, maxPairs: 4 },
};

function getWeightPerPair() {
  const config = getCdekConfig();
  return Math.max(1000, Number(config.packageWeight || 1500));
}

function boxFor(type: 'L' | 'XL', pairs: number): CdekBox {
  const box = CDEK_BOXES[type];
  return {
    type,
    pairs,
    weight: getWeightPerPair() * pairs,
    length: box.length,
    width: box.width,
    height: box.height,
  };
}

export function getCdekPackageForPairs(pairCount = 1) {
  const quantity = Math.max(1, Math.min(20, Math.ceil(Number(pairCount) || 1)));
  const boxes: CdekBox[] = [];
  let remaining = quantity;

  while (remaining > 0) {
    if (remaining === 1) {
      boxes.push(boxFor('L', 1));
      remaining -= 1;
    } else {
      const pairsInBox = Math.min(4, remaining);
      boxes.push(boxFor('XL', pairsInBox));
      remaining -= pairsInBox;
    }
  }

  const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0);
  const primaryBox = boxes[0];
  const packageType = boxes.map((box) => `${box.type}${box.pairs > 1 ? `×${box.pairs}` : ''}`).join(' + ');
  const boxSummary = boxes.map((box) => `${box.type}: ${box.length}×${box.width}×${box.height} см, ${box.weight} г`).join('; ');

  return {
    pairCount: quantity,
    packageType,
    boxCount: boxes.length,
    totalWeight,
    weight: totalWeight,
    length: primaryBox.length,
    width: primaryBox.width,
    height: primaryBox.height,
    boxes,
    boxSummary,
  };
}

export function getDefaultCdekPackage() {
  return getCdekPackageForPairs(1);
}

export function normalizeCdekPhone(value?: string) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return `+${digits}`;
}

export function getLatestCdekStatus(entity: any) {
  const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
  const latest = statuses[statuses.length - 1] || null;
  const code = String(latest?.code || entity?.status?.code || '').trim();
  const name = String(latest?.name || entity?.status?.name || '').trim();
  const dateTime = latest?.date_time || latest?.dateTime || null;
  return {
    code,
    name,
    description: name || code || '',
    dateTime,
  };
}

export async function getCdekOrderInfo(uuid: string) {
  if (!uuid) throw new Error('Не найден UUID заказа СДЭК');
  const data = await cdekRequest(`/v2/orders/${encodeURIComponent(uuid)}`);
  const entity = data?.entity || data;
  const status = getLatestCdekStatus(entity);
  return {
    raw: data,
    entity,
    uuid: entity?.uuid || uuid,
    cdekNumber: String(entity?.cdek_number || entity?.number || entity?.im_number || '').trim(),
    status,
  };
}
