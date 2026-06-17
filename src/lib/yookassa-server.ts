import { randomUUID } from 'crypto';

export function getYookassaConfig() {
  return {
    shopId: (process.env.YOOKASSA_SHOP_ID || '').trim(),
    secretKey: (process.env.YOOKASSA_SECRET_KEY || '').trim(),
    apiUrl: (process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru').trim().replace(/\/$/, ''),
    returnUrl: (process.env.YOOKASSA_RETURN_URL || '').trim(),
    webhookSecret: (process.env.YOOKASSA_WEBHOOK_SECRET || '').trim(),
  };
}

export function hasYookassaCredentials() {
  const config = getYookassaConfig();
  return Boolean(config.shopId && config.secretKey);
}

function authHeader() {
  const config = getYookassaConfig();
  if (!config.shopId || !config.secretKey) {
    throw new Error('ЮKassa не настроена: добавьте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в Vercel');
  }
  return `Basic ${Buffer.from(`${config.shopId}:${config.secretKey}`).toString('base64')}`;
}

function amountValue(value: number) {
  return (Math.max(0, Number(value || 0))).toFixed(2);
}

async function yookassaRequest(path: string, init: RequestInit = {}) {
  const config = getYookassaConfig();
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      'Idempotence-Key': randomUUID(),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const description = data?.description || data?.error_description || data?.message || data?.type || 'Ошибка ЮKassa API';
    throw new Error(`ЮKassa API ${response.status}: ${description}`);
  }
  return data;
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
