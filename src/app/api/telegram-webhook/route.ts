import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizePhone(value?: string) {
  return String(value || '').trim();
}

export async function POST(request: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ ok: true, skipped: 'Supabase is not configured' });

    const update = await request.json().catch(() => null);
    const message = update?.message || update?.edited_message;
    const contact = message?.contact;
    const from = message?.from;

    if (!contact?.phone_number || !from?.id) {
      return NextResponse.json({ ok: true, skipped: 'No contact in update' });
    }

    const telegramId = String(contact.user_id || from.id);
    if (telegramId !== String(from.id)) {
      return NextResponse.json({ ok: true, skipped: 'Contact does not belong to sender' });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('customer_profiles')
      .upsert({
        telegram_id: telegramId,
        telegram_username: from.username || '',
        first_name: contact.first_name || from.first_name || '',
        last_name: contact.last_name || from.last_name || '',
        phone: normalizePhone(contact.phone_number),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'telegram_id' });

    if (error) throw error;

    return NextResponse.json({ ok: true, saved: true });
  } catch (error: any) {
    console.error('[telegram-webhook] Failed', error);
    return NextResponse.json({ ok: false, error: error.message || 'Webhook failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'STUDIO 82 Telegram webhook' });
}
