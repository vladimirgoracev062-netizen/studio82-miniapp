import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import { seedProducts } from '@/data/products';
import type { CartItem } from '@/types';

export const dynamic = 'force-dynamic';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value || 0) + ' ₽';
}

function deliveryLabel(value?: string) {
  if (value === 'moscow') return 'Доставка по Москве';
  return 'СДЭК / ПВЗ';
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
    deliveryLabel(order.deliveryType),
    order.city ? `Город: ${order.city}` : '',
    order.cdekPoint ? `ПВЗ/адрес: ${order.cdekPoint}` : '',
    '',
    'Товары:',
    items,
    '',
    `Админка: ${adminUrl}/admin`,
  ].filter(Boolean).join('\n');
}

async function notifyAdminAboutOrder(order: ReturnType<typeof orderFromRow>, origin: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: buildAdminOrderText(order, origin),
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error('Failed to send Telegram order notification', error);
  }
}


export async function GET(request: Request) {
  try {
    if (!hasSupabase()) return NextResponse.json({ orders: [] });
    const url = new URL(request.url);
    const admin = url.searchParams.get('admin') === '1';
    const telegramId = url.searchParams.get('telegram_id');
    if (admin && !isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });

    if (!admin && telegramId) query = query.eq('telegram_id', telegramId);

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
        title: [product.model, product.color].filter(Boolean).join(' '),
        size: item.size,
        price: Number(product.price || 0),
        quantity: Number(item.quantity || 1),
      };
    });

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        telegram_id: body.telegramId || '',
        telegram_username: body.telegramUsername || '',
        customer_name: body.customerName || '',
        customer_phone: body.phone || '',
        delivery_city: body.city || '',
        delivery_point: body.cdekPoint || '',
        delivery_type: body.deliveryType || 'cdek_pickup',
        payment_status: 'pending',
        order_status: 'Новый',
        total_amount: total,
      })
      .select('*')
      .single();
    if (orderError) throw orderError;

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
    await notifyAdminAboutOrder(normalizedOrder, new URL(request.url).origin);
    return NextResponse.json({ order: normalizedOrder });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create order' }, { status: 500 });
  }
}
