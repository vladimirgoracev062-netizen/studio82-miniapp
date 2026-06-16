import crypto from 'crypto';

export type TelegramVerifiedUser = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

const MAX_INIT_DATA_AGE_SECONDS = 60 * 60 * 24 * 7;

function getBotToken() {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

export function verifyTelegramInitData(initData?: string | null): TelegramVerifiedUser | null {
  const token = getBotToken();
  if (!token || !initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  try {
    const left = Buffer.from(calculatedHash, 'hex');
    const right = Buffer.from(hash, 'hex');
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  } catch {
    return null;
  }

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  const rawUser = params.get('user');
  if (!rawUser) return null;

  try {
    const user = JSON.parse(rawUser);
    if (!user?.id) return null;
    return {
      id: String(user.id),
      username: user.username || '',
      firstName: user.first_name || '',
      lastName: user.last_name || '',
    };
  } catch {
    return null;
  }
}

export function getTelegramInitDataFromRequest(request: Request) {
  return request.headers.get('x-telegram-init-data') || '';
}
