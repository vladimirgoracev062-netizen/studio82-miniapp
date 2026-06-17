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
    packageWeight: Number(process.env.CDEK_PACKAGE_WEIGHT_GRAMS || 1200),
    packageLength: Number(process.env.CDEK_PACKAGE_LENGTH_CM || 35),
    packageWidth: Number(process.env.CDEK_PACKAGE_WIDTH_CM || 25),
    packageHeight: Number(process.env.CDEK_PACKAGE_HEIGHT_CM || 15),
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
    const message = data?.errors?.[0]?.message || data?.message || data?.error_description || 'Ошибка СДЭК API';
    throw new Error(message);
  }

  return data;
}

export function getCdekTariffCode(mode: CdekDeliveryMode) {
  return mode === 'courier' ? 137 : 136;
}

export function getDefaultCdekPackage() {
  const config = getCdekConfig();
  return {
    weight: config.packageWeight,
    length: config.packageLength,
    width: config.packageWidth,
    height: config.packageHeight,
  };
}
