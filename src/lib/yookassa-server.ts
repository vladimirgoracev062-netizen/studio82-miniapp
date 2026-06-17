import { randomUUID } from 'crypto';

function cleanEnvValue(value: string) {
  return String(value || '')
    .trim()
    .replace(/^['\"]|['\"]$/g, '')
    .trim();
}

export function getYookassaConfig() {
  return {
    shopId: cleanEnvValue(process.env.YOOKASSA_SHOP_ID || ''),
    secretKey: cleanEnvValue(process.env.YOOKASSA_SECRET_KEY || ''),
    apiUrl: cleanEnvValue(process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru').replace(/\/$/, ''),
    returnUrl: cleanEnvValue(process.env.YOOKASSA_RETURN_URL || ''),
    webhookSecret: cleanEnvValue(process.env.YOOKASSA_WEBHOOK_SECRET || ''),
  };
}

export function hasYookassaCredentials() {
  const config = getYookassaConfig();
  return Boolean(config.shopId && config.secretKey);
}

export function yookassaCredentialsDiagnostics() {
  const config = getYookassaConfig();
  return {
    hasShopId: Boolean(config.shopId),
    hasSecretKey: Boolean(config.secretKey),
    shopIdLength: config.shopId.length,
    secretKeyLength: config.secretKey.length,
    shopIdLooksNumeric: /^\d+$/.test(config.shopId),
    secretKeyPrefix: config.secretKey ? `${config.secretKey.slice(0, 5)}...` : '',
    secretLooksLikeTestOrLiveKey: /^(test_|live_)/.test(config.secretKey),
    secretLooksLikeBearerOrOAuth: /^(bearer\s+|oauth_|ya29\.|eyJ)/i.test(config.secretKey),
    secretContainsSpaces: /\s/.test(config.secretKey),
    apiUrl: config.apiUrl,
    returnUrl: config.returnUrl || '(auto)',
    webhookSecret: Boolean(config.webhookSecret),
  };
}

function authHeader() {
  const config = getYookassaConfig();
  if (!config.shopId || !config.secretKey) {
    throw new Error('ЮKassa не настроена: добавьте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в Vercel');
  }
  return `Basic ${Buffer.from(`${config.shopId}:${config.secretKey}`, 'utf8').toString('base64')}`;
}

function amountValue(value: number) {
  return Math.max(0, Number(value || 0)).toFixed(2);
}

function formatYookassaError(status: number, data: any) {
  const description = data?.description || data?.error_description || data?.message || data?.type || 'Ошибка ЮKassa API';
  const code = data?.code ? ` код: ${data.code}` : '';
  const parameter = data?.parameter ? ` параметр: ${data.parameter}` : '';
  const id = data?.id ? ` id: ${data.id}` : '';
  return `ЮKassa API ${status}: ${description}${code}${parameter}${id}`;
}

async function yookassaRequest(path: string, init: RequestInit = {}) {
  const config = getYookassaConfig();
  const method = String(init.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    ...(init.headers as Record<string, string> | undefined),
  };

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['Idempotence-Key'] = randomUUID();
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    method,
    headers,
    cache: 'no-store',
  });

  const text = await response.text().catch(() => '');
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(formatYookassaError(response.status, data));
  }
  return data;
}

export async function getYookassaMe() {
  return yookassaRequest('/v3/me', { method: 'GET' });
}

export async function createYookassaPayment(params: {
  orderDbId: string;
  orderNumber: string;
  amount: number;
  description: string;
  returnUrl: string;
  customerName?: string;
  customerPhone?: string;
  deliveryType?: string;
}) {
  const body = {
    amount: {
      value: amountValue(params.amount),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description.slice(0, 128),
    metadata: {
      studio82_order_id: params.orderDbId,
      studio82_order_number: params.orderNumber,
      delivery_type: params.deliveryType || '',
      customer_name: params.customerName || '',
      customer_phone: params.customerPhone || '',
    },
  };

  return yookassaRequest('/v3/payments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getYookassaPayment(paymentId: string) {
  if (!paymentId) throw new Error('Не найден ID платежа ЮKassa');
  return yookassaRequest(`/v3/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

export function normalizeYookassaStatus(status?: string) {
  if (status === 'succeeded') return 'paid';
  if (status === 'canceled') return 'canceled';
  if (status === 'waiting_for_capture') return 'waiting_capture';
  return 'waiting_payment';
}

export function paymentConfirmationUrl(payment: any) {
  return String(payment?.confirmation?.confirmation_url || '').trim();
}
