import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase, isAdminRequest, orderFromRow } from '@/lib/supabase-server';
import { seedProducts } from '@/data/products';
import type { CartItem } from '@/types';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ order: fullOrder ? orderFromRow(fullOrder) : order });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create order' }, { status: 500 });
  }
}
