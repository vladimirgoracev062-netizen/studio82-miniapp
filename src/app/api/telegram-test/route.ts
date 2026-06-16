import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getTelegramEnv() {
  return {
    token: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim(),
    adminPassword: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin82',
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const password = url.searchParams.get('password') || '';
    const { token, chatId, adminPassword } = getTelegramEnv();

    if (password !== adminPassword) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!token || !chatId) {
      return NextResponse.json({
        ok: false,
        error: 'Telegram env variables are missing',
        hasToken: Boolean(token),
        hasChatId: Boolean(chatId),
      }, { status: 500 });
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ STUDIO 82: тестовое уведомление из Vercel работает',
        disable_web_page_preview: true,
      }),
    });

    const telegramBody = await telegramResponse.json().catch(() => null);

    if (!telegramResponse.ok || telegramBody?.ok === false) {
      console.error('[telegram-test] Telegram API error', telegramBody);
      return NextResponse.json({
        ok: false,
        error: 'Telegram API returned error',
        telegramStatus: telegramResponse.status,
        telegramBody,
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (error: any) {
    console.error('[telegram-test] Failed', error);
    return NextResponse.json({ ok: false, error: error.message || 'Failed to send test notification' }, { status: 500 });
  }
}
