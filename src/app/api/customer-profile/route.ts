import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase } from '@/lib/supabase-server';
import { getTelegramInitDataFromRequest, verifyTelegramInitData } from '@/lib/telegram-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = verifyTelegramInitData(getTelegramInitDataFromRequest(request));
    if (!user?.id) return NextResponse.json({ profile: null });
    if (!hasSupabase()) return NextResponse.json({ profile: null });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('telegram_id, telegram_username, first_name, last_name, phone, updated_at')
      .eq('telegram_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      profile: data ? {
        telegramId: data.telegram_id,
        telegramUsername: data.telegram_username || user.username || '',
        firstName: data.first_name || user.firstName || '',
        lastName: data.last_name || user.lastName || '',
        phone: data.phone || '',
        updatedAt: data.updated_at,
      } : {
        telegramId: user.id,
        telegramUsername: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: '',
      },
    });
  } catch (error: any) {
    console.error('[customer-profile] Failed', error);
    return NextResponse.json({ profile: null, error: error.message || 'Failed to load profile' }, { status: 500 });
  }
}
