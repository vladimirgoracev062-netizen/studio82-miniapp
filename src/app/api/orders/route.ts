import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import type { CartItem } from '@/types';
import { getTelegramInitDataFromRequest, verifyTelegramInitData } from '@/lib/telegram-server';

export const dynamic = 'force-dynamic';

function getTelegramEnv() {
  return {
    token: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim(),
  };
}

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value || 0) + ' ₽';
}

function deliveryLabel(value?: string, mode?: string) {
  if (value === 'moscow') return 'Доставка по Москве';
  if (value === 'cdek' && mode === 'courier') return 'СДЭК / курьер';
  return 'СДЭК / ПВЗ';
}


function cleanText(value?: string) {
  return (value || '').trim();
}

function normalizeTitlePart(value?: string) {
  return cleanText(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function productOrderTitle(product: any) {
  const brand = cleanText(product?.brand);
  const model = cleanText(product?.model || product?.title || product?.name || 'Товар');
  const color = cleanText(product?.color);
  const modelNorm = normalizeTitlePart(model);
  const colorNorm = normalizeTitlePart(color);
  const parts = [brand, model];
  if (color && colorNorm && !modelNorm.includes(colorNorm)) parts.push(color);
  return parts.filter(Boolean).join(' ');
}

function buildAdminOrderText(order: ReturnType<typeof orderFromRow>, adminUrl: string) {
  const items = order.items
    .map((item) => `• ${item.title}\n  Размер: ${item.size}\n  Количество: ${item.quantity}\n  Цена: ${formatRub(item.price)}`)
    .join('\n\n');

  return [
    '🆕 Новый заказ STUDIO 82',
    '',
    `Заказ №${order.id}`,
    `Сумма: ${formatRub(order.total)}`,
    '',
    'Клиент:',
    order.customerName ? `Имя: ${order.customerName}` : '',
    order.phone ? `Телефон: ${order.phone}` : '',
    order.telegramUsername ? `Telegram: @${order.telegramUsername}` : '',
    '',
    'Доставка:',
    deliveryLabel(order.deliveryType, order.cdekDeliveryMode),
    order.city ? `Город: ${order.city}` : '',
    order.cdekPoint ? `ПВЗ/адрес: ${order.cdekPoint}` : '',
    order.cdekDeliveryPrice ? `Стоимость доставки: ${formatRub(order.cdekDeliveryPrice)}` : '',
    '',
    'Товары:',
    items,
    '',
    `Админка: ${adminUrl}/admin`,
  ].filter(Boolean).join('\n');
}

async function notifyAdminAboutOrder(order: ReturnType<typeof orderFromRow>, origin: string) {
  const { token, chatId } = getTelegramEnv();

  if (!token || !chatId) {
    console.warn('[orders] Telegram notification skipped: env variables are missing', {
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    });
    return { ok: false, skipped: true, error: 'Telegram env variables are missing' };
  }

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildAdminOrderText(order, origin),
        disable_web_page_preview: true,
      }),
    });

    const telegramBody = await telegramResponse.json().catch(() => null);

    if (!telegramResponse.ok || telegramBody?.ok === false) {
      console.error('[orders] Telegram API error', telegramBody);
      return { ok: false, error: 'Telegram API returned error', telegramStatus: telegramResponse.status, telegramBody };
    }

    console.log('[orders] Telegram order notification sent', { orderId: order.id });
    return { ok: true };
  } catch (error: any) {
    console.error('[orders] Failed to send Telegram order notification', error);
    return { ok: false, error: error.message || 'Failed to send Telegram notification' };
  }
}


export async function GET(request: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ orders: [] });
    const url = new URL(request.url);
    const admin = url.searchParams.get('admin') === '1';
    if (admin && !isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const telegramUser = admin ? null : verifyTelegramInitData(getTelegramInitDataFromRequest(request));
    if (!admin && !telegramUser?.id) {
      return NextResponse.json({ orders: [] });
    }

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });

    if (!admin && telegramUser?.id) query = query.eq('telegram_id', telegramUser.id);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ orders: (data || []).map(orderFromRow) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });
    const body = await request.json();
    const cart = (body.cart || []) as CartItem[];
    const supabase = getSupabaseAdmin();
    const telegramUser = verifyTelegramInitData(getTelegramInitDataFromRequest(request) || body.telegramInitData || '');

    if (!telegramUser?.id) {
      return NextResponse.json({ error: 'Откройте приложение через Telegram, чтобы оформить заказ' }, { status: 401 });
    }

    if (!cart.length) return NextResponse.json({ error: 'Корзина пустая' }, { status: 400 });

    const productIds = cart.map((item) => item.productId);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*, product_sizes(size, stock)')
      .in('id', productIds);
    if (productsError) throw productsError;

    const items = cart.map((item) => {
      const product = (products || []).find((p: any) => p.id === item.productId);
      const size = product?.product_sizes?.find((s: any) => s.size === item.size);
      if (!product) throw new Error('Товар не найден');
      if (!size || Number(size.stock) < item.quantity) throw new Error(`Размер ${item.size} недоступен для ${product.model}`);
      return {
        product,
        productId: item.productId,
        title: productOrderTitle(product),
        size: item.size,
        price: Number(product.price || 0),
        quantity: Number(item.quantity || 1),
      };
    });

    const goodsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryPrice = Math.max(0, Number(body.cdekDeliveryPrice || 0));
    const total = goodsTotal + (body.deliveryType === 'cdek' ? deliveryPrice : 0);

    const baseOrderPayload = {
      telegram_id: telegramUser.id,
      telegram_username: telegramUser.username || body.telegramUsername || '',
      customer_name: body.customerName || '',
      customer_phone: body.phone || '',
      delivery_city: body.city || '',
      delivery_point: body.cdekPoint || '',
      delivery_type: body.deliveryType || 'cdek',
      payment_status: 'pending',
      order_status: 'Новый',
      total_amount: total,
    };

    const cdekOrderPayload = {
      ...baseOrderPayload,
      cdek_delivery_mode: body.cdekDeliveryMode || null,
      cdek_city_code: body.cdekCityCode || null,
      cdek_point_code: body.cdekPointCode || null,
      cdek_point_address: body.cdekPointAddress || null,
      cdek_recipient_address: body.cdekRecipientAddress || null,
      cdek_delivery_price: body.deliveryType === 'cdek' ? deliveryPrice : 0,
      cdek_tariff_code: body.cdekTariffCode || null,
      cdek_package_pair_count: body.cdekPackagePairCount || null,
      cdek_package_type: body.cdekPackageType || null,
      cdek_package_box_count: body.cdekPackageBoxCount || null,
      cdek_package_weight: body.cdekPackageWeight || null,
      cdek_package_length: body.cdekPackageLength || null,
      cdek_package_width: body.cdekPackageWidth || null,
      cdek_package_height: body.cdekPackageHeight || null,
    };

    let orderResult = await supabase.from('orders').insert(cdekOrderPayload).select('*').single();

    if (orderResult.error && /cdek_|delivery_price|tariff|package/i.test(orderResult.error.message || '')) {
      console.warn('[orders] CDEK columns are missing, retrying without optional fields. Run SQL migration for full CDEK support.', orderResult.error.message);
      orderResult = await supabase.from('orders').insert(baseOrderPayload).select('*').single();
    }

    if (orderResult.error) throw orderResult.error;
    const order = orderResult.data;

    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      product_title: item.title,
      size: item.size,
      price: item.price,
      quantity: item.quantity,
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    for (const item of items) {
      const sizeRow = item.product.product_sizes.find((s: any) => s.size === item.size);
      await supabase.from('product_sizes').update({ stock: Math.max(0, Number(sizeRow.stock || 0) - item.quantity) }).eq('product_id', item.productId).eq('size', item.size);
    }

    const { data: fullOrder } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).single();
    const normalizedOrder = fullOrder ? orderFromRow(fullOrder) : orderFromRow({ ...order, order_items: orderItems });
    const notification = await notifyAdminAboutOrder(normalizedOrder, new URL(request.url).origin);
    return NextResponse.json({ order: normalizedOrder, notification });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create order' }, { status: 500 });
  }
}
